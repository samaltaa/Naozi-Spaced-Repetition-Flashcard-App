from __future__ import annotations

import hashlib
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from curator.config import get_settings, prompt_version
from curator.db import repository
from curator.db.repository import CacheKey
from curator.extract import ExtractionResult, Rejection, extract_from_text
from curator.known import drop_known, known_keys
from curator.pricing import cost_usd
from curator.schema import ExtractedItem

Extractor = Callable[..., ExtractionResult]

# Outcome

@dataclass
class JobOutcome:
    job_id: uuid.UUID
    items: list[ExtractedItem] = field(default_factory=list)
    skipped: list[Rejection] = field(default_factory=list)
    rejected: list[Rejection] = field(default_factory=list)
    known_dropped: int = 0
    cache_hit: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: Decimal | None = None
    prompt_version: str = "0"

# Hashing

def content_hash(text: str) -> str:
    normalized = " ".join(unicodedata.normalize("NFC", text).split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

# Result serialization

def result_to_dict(result: ExtractionResult) -> dict[str, Any]:
    return {
        "items": [item.model_dump(mode="json") for item in result.items],
        "skipped": [asdict(entry) for entry in result.skipped],
        "rejected": [asdict(entry) for entry in result.rejected],
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "prompt_version": result.prompt_version,
    }

def result_from_dict(data: dict[str, Any]) -> ExtractionResult:
    return ExtractionResult(
        items=[ExtractedItem.model_validate(item) for item in data.get("items", [])],
        skipped=[Rejection(**entry) for entry in data.get("skipped", [])],
        rejected=[Rejection(**entry) for entry in data.get("rejected", [])],
        input_tokens=data.get("input_tokens", 0),
        output_tokens=data.get("output_tokens", 0),
        prompt_version=data.get("prompt_version", "0"),
    )

# Submitting a job

def submit_job(
    session: Session,
    user_id: uuid.UUID,
    text: str,
    *,
    source_url: str | None = None,
    target_language: str = "Spanish",
    source_language: str = "English",
    lang: str = "es",
) -> uuid.UUID:
    settings = get_settings()
    key = CacheKey(
        content_hash=content_hash(text),
        lang=lang.lower(),
        source_language=source_language,
        target_language=target_language,
        prompt_version=prompt_version("extract_items"),
        model=settings.extraction_model,
        item_limit=settings.max_items_per_text,
    )
    job = repository.create_job(session, user_id, key, source_url)
    session.commit()
    return job.id

# Processing a job

def process_job(
    session: Session,
    job_id: uuid.UUID,
    text: str,
    extractor: Extractor = extract_from_text,
) -> JobOutcome:
    job = repository.get_job(session, job_id)
    if job is None:
        raise LookupError(f"job {job_id} does not exist")

    key = CacheKey.from_job(job)
    repository.start_job(session, job)
    session.commit()

    try:
        outcome = JobOutcome(job_id=job_id, prompt_version=key.prompt_version)

        cached = repository.cache_lookup(session, key)
        session.commit()
        if cached is not None:
            result = result_from_dict(cached.result)
            outcome.cache_hit = True
            outcome.cost_usd = Decimal(0)
        else:
            result = extractor(
                text,
                target_language=key.target_language,
                source_language=key.source_language,
                lang=key.lang,
            )
            if result.failed_batches and not result.items:
                raise RuntimeError(f"all {result.failed_batches} extraction batches failed")
            outcome.input_tokens = result.input_tokens
            outcome.output_tokens = result.output_tokens
            outcome.cost_usd = cost_usd(key.model, result.input_tokens, result.output_tokens)
            if not result.failed_batches:
                repository.cache_store(
                    session,
                    key,
                    text,
                    result_to_dict(result),
                    result.input_tokens,
                    result.output_tokens,
                    outcome.cost_usd,
                )

        known = known_keys(repository.known_terms(session, job.user_id, key.lang), key.lang)
        fresh, dropped = drop_known(result.items, known, key.lang)

        outcome.items = fresh
        outcome.skipped = result.skipped
        outcome.rejected = result.rejected
        outcome.known_dropped = len(dropped)

        repository.finish_job(
            session,
            job,
            fresh,
            cache_hit=outcome.cache_hit,
            input_tokens=outcome.input_tokens,
            output_tokens=outcome.output_tokens,
            cost_usd=outcome.cost_usd,
            known_dropped=outcome.known_dropped,
            skipped=[asdict(entry) for entry in result.skipped],
            rejected=[asdict(entry) for entry in result.rejected],
        )
        session.commit()
        return outcome
    except Exception as error:
        session.rollback()
        repository.fail_job(session, job_id, f"{type(error).__name__}: {error}")
        session.commit()
        raise

# Running a job in one call

def run_job(
    session: Session,
    user_id: uuid.UUID,
    text: str,
    *,
    source_url: str | None = None,
    target_language: str = "Spanish",
    source_language: str = "English",
    lang: str = "es",
    extractor: Extractor = extract_from_text,
) -> JobOutcome:
    job_id = submit_job(
        session,
        user_id,
        text,
        source_url=source_url,
        target_language=target_language,
        source_language=source_language,
        lang=lang,
    )
    return process_job(session, job_id, text, extractor)
