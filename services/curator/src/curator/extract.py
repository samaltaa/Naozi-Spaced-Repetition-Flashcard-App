from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

import instructor
from anthropic import Anthropic, APIError
from instructor.core import InstructorRetryException
from pydantic import ValidationError

from curator.config import get_settings, load_prompt, prompt_version
from curator.nlp.tokenize import candidates_from_text, rank_candidates
from curator.schema import (
    Candidate,
    CourseItemDraft,
    ExtractedItem,
    ExtractionBatch,
    SourceText,
    enforce_candidates,
    fold,
    to_draft,
    validate_against_source,
)

logger = logging.getLogger(__name__)

# Result types

@dataclass
class Rejection:
    lemma: str
    reason: str

@dataclass
class ExtractionResult:
    items: list[ExtractedItem] = field(default_factory=list)
    skipped: list[Rejection] = field(default_factory=list)
    rejected: list[Rejection] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    prompt_version: str = "0"
    failed_batches: int = 0

    @property
    def drafts(self) -> list[CourseItemDraft]:
        return [to_draft(item) for item in self.items]

# Client

def build_client() -> instructor.Instructor:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return instructor.from_anthropic(
        Anthropic(api_key=settings.anthropic_api_key, timeout=settings.request_timeout_seconds)
    )

# Batching

def batched(items: list[Candidate], size: int) -> list[list[Candidate]]:
    return [items[i : i + size] for i in range(0, len(items), size)]

def candidates_payload(candidates: list[Candidate]) -> str:
    return json.dumps(
        [
            {
                "lemma": c.lemma,
                "pos": c.pos,
                "gender": c.gender,
                "sentence": c.context,
            }
            for c in candidates
        ],
        ensure_ascii=False,
        indent=2,
    )

# Extraction

def extract_batch(
    client: instructor.Instructor,
    candidates: list[Candidate],
    source: SourceText,
    source_language: str,
    target_language: str,
) -> tuple[list[ExtractedItem], list[Rejection], int, int]:
    settings = get_settings()
    system = load_prompt(
        "extract_items",
        source_language=source_language,
        target_language=target_language,
    )
    allowed = {fold(c.lemma) for c in candidates}

    batch, completion = client.chat.completions.create_with_completion(
        model=settings.extraction_model,
        max_tokens=settings.max_tokens,
        max_retries=settings.max_retries,
        system=system,
        messages=[{"role": "user", "content": candidates_payload(candidates)}],
        response_model=ExtractionBatch,
    )

    kept: list[ExtractedItem] = []
    rejected: list[Rejection] = []

    for item in batch.items:
        try:
            enforce_candidates(item, allowed)
            validate_against_source(item, source)
        except ValueError as error:
            rejected.append(Rejection(lemma=item.lemma, reason=str(error)))
            continue
        kept.append(item)

    usage = getattr(completion, "usage", None)
    input_tokens = getattr(usage, "input_tokens", 0)
    output_tokens = getattr(usage, "output_tokens", 0)

    return kept, rejected, input_tokens, output_tokens

def extract_from_text(
    text: str,
    target_language: str = "Spanish",
    source_language: str = "English",
    lang: str = "es",
    known_lemmas: set[str] | None = None,
) -> ExtractionResult:
    settings = get_settings()
    result = ExtractionResult(prompt_version=prompt_version("extract_items"))

    candidates = rank_candidates(
        candidates_from_text(text, lang=lang),
        known_lemmas=known_lemmas,
        limit=settings.max_items_per_text,
    )
    if not candidates:
        return result

    client = build_client()
    source = SourceText(text)

    for group in batched(candidates, settings.batch_size):
        try:
            kept, rejected, input_tokens, output_tokens = extract_batch(
                client, group, source, source_language, target_language
            )
        except (InstructorRetryException, APIError, ValidationError) as error:
            logger.warning("batch failed: %s", error)
            result.failed_batches += 1
            result.rejected.extend(Rejection(lemma=c.lemma, reason="batch failed") for c in group)
            continue

        result.input_tokens += input_tokens
        result.output_tokens += output_tokens
        result.rejected.extend(rejected)

        for item in kept:
            if item.skip_reason:
                result.skipped.append(Rejection(lemma=item.lemma, reason=item.skip_reason))
                continue
            result.items.append(item)

    return result