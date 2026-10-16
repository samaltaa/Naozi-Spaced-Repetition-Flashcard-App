from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Protocol

import instructor
from anthropic import Anthropic, APIError
from instructor.core import InstructorRetryException
from pydantic import ValidationError

from curator.config import get_settings, load_prompt, prompt_version
from curator.nlp.tokenize import candidates_from_text, citation_form, rank_candidates
from curator.schema import (
    Candidate,
    CourseItemDraft,
    ExtractedItem,
    ReplyBatch,
    ReplyItem,
    fold,
    to_draft,
)

logger = logging.getLogger(__name__)

# Result types

@dataclass
class Rejection:
    lemma: str
    reason: str

@dataclass
class BatchUsage:
    size: int
    input_tokens: int
    output_tokens: int

@dataclass
class ExtractionResult:
    items: list[ExtractedItem] = field(default_factory=list)
    skipped: list[Rejection] = field(default_factory=list)
    rejected: list[Rejection] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    prompt_version: str = "0"
    failed_batches: int = 0
    cached_items: int = 0
    known_dropped: int = 0
    batches: list[BatchUsage] = field(default_factory=list)

    @property
    def drafts(self) -> list[CourseItemDraft]:
        return [to_draft(item) for item in self.items]

    @property
    def model_called(self) -> bool:
        return bool(self.batches) or self.failed_batches > 0

# Translations

@dataclass(frozen=True)
class Translation:
    lemma: str
    pos: str
    gloss: str
    form: str | None = None
    alternates: tuple[str, ...] = ()
    skip_reason: str | None = None

TranslationKey = tuple[str, str]

def translation_key(lemma: str, pos: str) -> TranslationKey:
    return (fold(lemma), pos)

class TranslationStore(Protocol):
    def lookup(self, candidates: list[Candidate]) -> dict[TranslationKey, Translation]: ...

    def save(self, translations: list[Translation]) -> None: ...

# Client

def build_client() -> instructor.Instructor:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return instructor.from_anthropic(
        Anthropic(api_key=settings.anthropic_api_key, timeout=settings.request_timeout_seconds)
    )

# Requests

def batched(items: list[Candidate], size: int) -> list[list[Candidate]]:
    return [items[i : i + size] for i in range(0, len(items), size)]

def candidates_payload(candidates: list[Candidate]) -> str:
    entries = []
    for number, c in enumerate(candidates, start=1):
        entry = {"id": number, "lemma": c.lemma, "pos": c.pos, "form": citation_form(c)}
        if c.context:
            entry["sentence"] = c.context
        entries.append(entry)
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":"))

def request_batch(
    client: instructor.Instructor,
    candidates: list[Candidate],
    system: str,
) -> tuple[list[Translation], list[Rejection], BatchUsage]:
    settings = get_settings()
    reply, completion = client.chat.completions.create_with_completion(
        model=settings.extraction_model,
        max_tokens=settings.max_tokens,
        max_retries=settings.max_retries,
        system=system,
        messages=[{"role": "user", "content": candidates_payload(candidates)}],
        response_model=ReplyBatch,
    )

    replies: dict[int, ReplyItem] = {}
    for item in reply.items:
        replies.setdefault(item.id, item)

    translations: list[Translation] = []
    rejected: list[Rejection] = []
    for number, candidate in enumerate(candidates, start=1):
        entry = replies.get(number)
        if entry is None:
            rejected.append(Rejection(lemma=candidate.lemma, reason="no reply from the model"))
            continue
        translations.append(
            Translation(
                lemma=candidate.lemma,
                pos=candidate.pos,
                gloss=entry.gloss,
                form=entry.form,
                alternates=tuple(entry.alternates),
                skip_reason=entry.skip,
            )
        )

    usage = getattr(completion, "usage", None)
    return (
        translations,
        rejected,
        BatchUsage(
            size=len(candidates),
            input_tokens=getattr(usage, "input_tokens", 0),
            output_tokens=getattr(usage, "output_tokens", 0),
        ),
    )

# Building items

SAME_AS_GLOSS = "same word in both languages"

def same_as_gloss(candidate: Candidate, translation: Translation) -> bool:
    answer = translation.form or citation_form(candidate)
    return bool(translation.gloss) and fold(answer) == fold(translation.gloss)

def build_item(candidate: Candidate, translation: Translation) -> ExtractedItem:
    answer = translation.form or citation_form(candidate)
    alternates = list(translation.alternates)
    if fold(answer) != fold(candidate.lemma):
        alternates.insert(0, candidate.lemma)
    return ExtractedItem(
        lemma=candidate.lemma,
        answer=answer,
        prompt=translation.gloss,
        alternates=alternates,
        pos=candidate.pos,
        context=candidate.context,
    )

# Extraction

def translate(
    candidates: list[Candidate],
    source_language: str,
    target_language: str,
    result: ExtractionResult,
) -> list[Translation]:
    settings = get_settings()
    system = load_prompt(
        "extract_items",
        source_language=source_language,
        target_language=target_language,
    )
    client = build_client()
    fresh: list[Translation] = []

    for group in batched(candidates, settings.batch_size):
        try:
            translations, rejected, usage = request_batch(client, group, system)
        except (InstructorRetryException, APIError, ValidationError) as error:
            logger.warning("batch failed: %s", error)
            result.failed_batches += 1
            result.rejected.extend(Rejection(lemma=c.lemma, reason="batch failed") for c in group)
            continue

        result.batches.append(usage)
        result.input_tokens += usage.input_tokens
        result.output_tokens += usage.output_tokens
        result.rejected.extend(rejected)
        fresh.extend(translations)

    return fresh

def extract_from_text(
    text: str,
    target_language: str = "Spanish",
    source_language: str = "English",
    lang: str = "es",
    known_lemmas: set[str] | None = None,
    store: TranslationStore | None = None,
) -> ExtractionResult:
    settings = get_settings()
    result = ExtractionResult(prompt_version=prompt_version("extract_items"))

    found = candidates_from_text(text, lang=lang)
    known_set = known_lemmas or set()
    result.known_dropped = sum(1 for c in found if fold(c.lemma) in known_set)
    candidates = rank_candidates(found, known_lemmas=known_set, limit=settings.max_items_per_text)
    if not candidates:
        return result

    known = store.lookup(candidates) if store else {}
    missing = [c for c in candidates if translation_key(c.lemma, c.pos) not in known]
    result.cached_items = len(candidates) - len(missing)

    fresh = translate(missing, source_language, target_language, result) if missing else []
    translations = dict(known)
    translations.update({translation_key(t.lemma, t.pos): t for t in fresh})

    usable: set[TranslationKey] = set()
    for candidate in candidates:
        key = translation_key(candidate.lemma, candidate.pos)
        translation = translations.get(key)
        if translation is None:
            continue
        reason = translation.skip_reason or (SAME_AS_GLOSS if same_as_gloss(candidate, translation) else None)
        if reason:
            result.skipped.append(Rejection(lemma=candidate.lemma, reason=reason))
            usable.add(key)
            continue
        try:
            result.items.append(build_item(candidate, translation))
        except ValueError as error:
            result.rejected.append(Rejection(lemma=candidate.lemma, reason=str(error)))
            continue
        usable.add(key)

    if store:
        store.save([t for t in fresh if translation_key(t.lemma, t.pos) in usable])

    return result
