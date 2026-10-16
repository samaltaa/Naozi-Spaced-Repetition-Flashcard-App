from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, replace
from decimal import Decimal
from typing import Protocol

import instructor
from anthropic import Anthropic, APIError
from instructor.core import InstructorRetryException
from pydantic import ValidationError

from curator.config import get_settings, load_prompt, prompt_version
from curator.languages import SPANISH, LanguageProfile, profile_for
from curator.nlp.tokenize import candidates_from_text, citation_form, rank_candidates
from curator.pricing import cost_usd
from curator.schema import (
    Candidate,
    CourseItemDraft,
    ExtractedItem,
    ReadingBatch,
    ReplyBatch,
    ReplyItem,
    fold,
    to_draft,
    without_stress,
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
    model: str = ""
    failed_models: list[str] = field(default_factory=list)
    purpose: str = "translate"

    @property
    def cost_usd(self) -> Decimal | None:
        return cost_usd(self.model, self.input_tokens, self.output_tokens)

FAILURES = (InstructorRetryException, APIError, ValidationError)

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

    @property
    def cost_usd(self) -> Decimal | None:
        total = Decimal(0)
        for batch in self.batches:
            cost = batch.cost_usd
            if cost is None:
                return None
            total += cost
        return total

# Translations

@dataclass(frozen=True)
class Translation:
    lemma: str
    pos: str
    gloss: str
    form: str | None = None
    alternates: tuple[str, ...] = ()
    reading: str | None = None
    skip_reason: str | None = None
    model: str = ""

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

def candidates_payload(candidates: list[Candidate], profile: LanguageProfile = SPANISH) -> str:
    entries = []
    for number, c in enumerate(candidates, start=1):
        entry = {"id": number, "lemma": c.lemma, "pos": c.pos, "form": citation_form(c, profile)}
        if c.context:
            entry["sentence"] = c.context
        entries.append(entry)
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":"))

def request_batch(
    client: instructor.Instructor,
    candidates: list[Candidate],
    system: str,
    model: str,
    profile: LanguageProfile = SPANISH,
) -> tuple[list[Translation], list[Rejection], BatchUsage]:
    settings = get_settings()
    reply, completion = client.chat.completions.create_with_completion(
        model=model,
        max_tokens=settings.max_tokens,
        max_retries=settings.max_retries,
        system=system,
        messages=[{"role": "user", "content": candidates_payload(candidates, profile)}],
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
                model=model,
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
            model=model,
        ),
    )

def request_with_fallback(
    client: instructor.Instructor,
    candidates: list[Candidate],
    system: str,
    models: list[str],
    profile: LanguageProfile = SPANISH,
) -> tuple[list[Translation], list[Rejection], BatchUsage] | None:
    failed: list[str] = []
    for model in models:
        try:
            translations, rejected, usage = request_batch(client, candidates, system, model, profile)
        except FAILURES as error:
            logger.warning("batch of %d failed on %s: %s", len(candidates), model, error)
            failed.append(model)
            continue
        usage.failed_models = failed
        return translations, rejected, usage
    return None

# Readings

def needs_reading(word: str, profile: LanguageProfile) -> bool:
    return any(sum(ch in profile.vowels for ch in part.lower()) > 1 for part in word.split())

def readings_payload(words: list[str]) -> str:
    entries = [{"id": number, "word": word} for number, word in enumerate(words, start=1)]
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":"))

def request_readings(
    client: instructor.Instructor, words: list[str], system: str, model: str
) -> tuple[dict[int, str], BatchUsage]:
    settings = get_settings()
    reply, completion = client.chat.completions.create_with_completion(
        model=model,
        max_tokens=settings.max_tokens,
        max_retries=settings.max_retries,
        system=system,
        messages=[{"role": "user", "content": readings_payload(words)}],
        response_model=ReadingBatch,
    )
    readings = {item.id: item.reading for item in reply.items if item.reading}
    usage = getattr(completion, "usage", None)
    return readings, BatchUsage(
        size=len(words),
        input_tokens=getattr(usage, "input_tokens", 0),
        output_tokens=getattr(usage, "output_tokens", 0),
        model=model,
        purpose="reading",
    )

def add_readings(
    client: instructor.Instructor,
    translations: list[Translation],
    candidates: list[Candidate],
    profile: LanguageProfile,
    target_language: str,
    result: ExtractionResult,
) -> list[Translation]:
    model = get_settings().reading_model
    if not profile.stress_reading or not model:
        return translations

    by_key = {translation_key(c.lemma, c.pos): c for c in candidates}
    targets: list[tuple[int, str]] = []
    for index, t in enumerate(translations):
        candidate = by_key.get(translation_key(t.lemma, t.pos))
        if t.skip_reason or candidate is None:
            continue
        answer = t.form or citation_form(candidate, profile)
        if needs_reading(answer, profile):
            targets.append((index, answer))
    if not targets:
        return translations

    system = load_prompt("stress_readings", target_language=target_language)
    try:
        readings, usage = request_readings(client, [word for _, word in targets], system, model)
    except FAILURES as error:
        logger.warning("readings for %d words failed on %s: %s", len(targets), model, error)
        return translations

    result.batches.append(usage)
    result.input_tokens += usage.input_tokens
    result.output_tokens += usage.output_tokens
    updated = list(translations)
    for number, (index, _) in enumerate(targets, start=1):
        updated[index] = replace(updated[index], reading=readings.get(number))
    return updated

# Building items

SAME_AS_GLOSS = "same word in both languages"

def same_as_gloss(
    candidate: Candidate, translation: Translation, profile: LanguageProfile = SPANISH
) -> bool:
    answer = translation.form or citation_form(candidate, profile)
    return bool(translation.gloss) and fold(answer) == fold(translation.gloss)

def item_lemma(candidate: Candidate, answer: str, profile: LanguageProfile = SPANISH) -> str:
    if fold(candidate.lemma) in fold(answer) or not profile.reflexive_suffix:
        return candidate.lemma
    return candidate.lemma.removesuffix(profile.reflexive_suffix)

def checked_reading(answer: str, reading: str | None, profile: LanguageProfile) -> str | None:
    if not profile.stress_reading or not reading:
        return None
    if fold(without_stress(reading)) != fold(answer) or without_stress(reading) == reading:
        return None
    return reading

def build_item(
    candidate: Candidate, translation: Translation, profile: LanguageProfile = SPANISH
) -> ExtractedItem:
    answer = translation.form or citation_form(candidate, profile)
    lemma = item_lemma(candidate, answer, profile)
    alternates = list(translation.alternates)
    if fold(answer) != fold(lemma):
        alternates.insert(0, lemma)
    return ExtractedItem(
        lemma=lemma,
        answer=answer,
        prompt=translation.gloss,
        alternates=alternates,
        pos=candidate.pos,
        context=candidate.context,
        reading=checked_reading(answer, translation.reading, profile),
    )

# Extraction

def system_prompt(profile: LanguageProfile, source_language: str, target_language: str) -> str:
    return load_prompt(
        "extract_items",
        form_rules=profile.form_rules,
        source_language=source_language,
        target_language=target_language,
    )

def translate(
    candidates: list[Candidate],
    profile: LanguageProfile,
    source_language: str,
    target_language: str,
    result: ExtractionResult,
) -> list[Translation]:
    settings = get_settings()
    system = system_prompt(profile, source_language, target_language)
    client = build_client()
    fresh: list[Translation] = []

    for group in batched(candidates, settings.batch_size):
        reply = request_with_fallback(client, group, system, settings.model_chain, profile)
        if reply is None:
            result.failed_batches += 1
            result.rejected.extend(Rejection(lemma=c.lemma, reason="every model failed") for c in group)
            continue

        translations, rejected, usage = reply
        result.batches.append(usage)
        result.input_tokens += usage.input_tokens
        result.output_tokens += usage.output_tokens
        result.rejected.extend(rejected)
        fresh.extend(translations)

    return add_readings(client, fresh, candidates, profile, target_language, result)

def extract_from_text(
    text: str,
    target_language: str = "Spanish",
    source_language: str = "English",
    lang: str = "es",
    known_lemmas: set[str] | None = None,
    store: TranslationStore | None = None,
) -> ExtractionResult:
    settings = get_settings()
    profile = profile_for(lang)
    result = ExtractionResult(prompt_version=prompt_version("extract_items"))

    found = candidates_from_text(text, lang=profile.code)
    known_set = known_lemmas or set()
    result.known_dropped = sum(1 for c in found if fold(c.lemma) in known_set)
    candidates = rank_candidates(found, known_lemmas=known_set, limit=settings.max_items_per_text)
    if not candidates:
        return result

    known = store.lookup(candidates) if store else {}
    missing = [c for c in candidates if translation_key(c.lemma, c.pos) not in known]
    result.cached_items = len(candidates) - len(missing)

    fresh = translate(missing, profile, source_language, target_language, result) if missing else []
    translations = dict(known)
    translations.update({translation_key(t.lemma, t.pos): t for t in fresh})

    usable: set[TranslationKey] = set()
    answers: set[str] = set()
    for candidate in candidates:
        key = translation_key(candidate.lemma, candidate.pos)
        translation = translations.get(key)
        if translation is None:
            continue
        same = same_as_gloss(candidate, translation, profile)
        reason = translation.skip_reason or (SAME_AS_GLOSS if same else None)
        if reason:
            result.skipped.append(Rejection(lemma=candidate.lemma, reason=reason))
            usable.add(key)
            continue
        try:
            item = build_item(candidate, translation, profile)
        except ValueError as error:
            result.rejected.append(Rejection(lemma=candidate.lemma, reason=str(error)))
            continue
        usable.add(key)
        if fold(item.answer) in answers:
            continue
        answers.add(fold(item.answer))
        result.items.append(item)

    if store:
        store.save([t for t in fresh if translation_key(t.lemma, t.pos) in usable])

    return result
