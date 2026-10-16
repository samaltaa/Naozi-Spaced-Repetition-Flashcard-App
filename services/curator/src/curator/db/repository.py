from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from curator.db.models import ContentCache, ExtractedItemRow, ExtractionJob
from curator.schema import ExtractedItem

# Cache key

@dataclass(frozen=True)
class CacheKey:
    content_hash: str
    lang: str
    source_language: str
    target_language: str
    prompt_version: str
    model: str
    item_limit: int

    def columns(self) -> dict[str, Any]:
        return {
            "content_hash": self.content_hash,
            "lang": self.lang,
            "source_language": self.source_language,
            "target_language": self.target_language,
            "prompt_version": self.prompt_version,
            "model": self.model,
            "item_limit": self.item_limit,
        }

    @classmethod
    def from_job(cls, job: ExtractionJob) -> CacheKey:
        return cls(
            content_hash=job.content_hash,
            lang=job.lang,
            source_language=job.source_language,
            target_language=job.target_language,
            prompt_version=job.prompt_version,
            model=job.model,
            item_limit=job.item_limit,
        )

# Known terms

KNOWN_TERMS = text(
    """
    select distinct t.term
    from public.user_item_state s
    join public.items i on i.id = s.item_id
    join public.courses c on c.id = i.course_id
    cross join lateral unnest(array_append(i.alternates, i.answer)) as t (term)
    where s.user_id = :user_id
      and lower(split_part(c.target_lang, '-', 1)) = :lang
      and t.term <> ''
    """
)

def known_terms(session: Session, user_id: uuid.UUID, lang: str) -> list[str]:
    rows = session.execute(KNOWN_TERMS, {"user_id": user_id, "lang": lang.lower()})
    return [row.term for row in rows]

# Content cache

def cache_lookup(session: Session, key: CacheKey) -> ContentCache | None:
    columns = key.columns()
    statement = select(ContentCache).where(
        *(getattr(ContentCache, name) == value for name, value in columns.items())
    )
    entry = session.scalars(statement).one_or_none()
    if entry is not None:
        session.execute(
            update(ContentCache)
            .where(ContentCache.id == entry.id)
            .values(hit_count=ContentCache.hit_count + 1, last_hit_at=func.now())
        )
    return entry

def cache_store(
    session: Session,
    key: CacheKey,
    source_text: str,
    result: dict[str, Any],
    input_tokens: int,
    output_tokens: int,
    cost_usd: Decimal | None,
) -> None:
    statement = (
        insert(ContentCache)
        .values(
            **key.columns(),
            source_text=source_text,
            result=result,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
        )
        .on_conflict_do_nothing(constraint="content_cache_key")
    )
    session.execute(statement)

# Jobs

def create_job(
    session: Session,
    user_id: uuid.UUID,
    key: CacheKey,
    source_url: str | None,
) -> ExtractionJob:
    job = ExtractionJob(
        user_id=user_id,
        source_url=source_url,
        status="queued",
        **key.columns(),
    )
    session.add(job)
    session.flush()
    return job

def start_job(session: Session, job: ExtractionJob) -> None:
    job.status = "running"
    job.started_at = func.now()
    session.flush()

def finish_job(
    session: Session,
    job: ExtractionJob,
    items: list[ExtractedItem],
    *,
    cache_hit: bool,
    input_tokens: int,
    output_tokens: int,
    cost_usd: Decimal | None,
    known_dropped: int,
    skipped: list[dict[str, str]],
    rejected: list[dict[str, str]],
) -> None:
    job.status = "done"
    job.cache_hit = cache_hit
    job.input_tokens = input_tokens
    job.output_tokens = output_tokens
    job.cost_usd = cost_usd
    job.known_dropped = known_dropped
    job.skipped = skipped
    job.rejected = rejected
    job.finished_at = func.now()
    job.items = [item_row(position, item) for position, item in enumerate(items)]
    session.flush()

def fail_job(session: Session, job_id: uuid.UUID, error: str) -> None:
    session.execute(
        update(ExtractionJob)
        .where(ExtractionJob.id == job_id)
        .values(status="failed", error=error[:2000], finished_at=func.now())
    )

def get_job(session: Session, job_id: uuid.UUID) -> ExtractionJob | None:
    return session.get(ExtractionJob, job_id)

def get_user_job(session: Session, job_id: uuid.UUID, user_id: uuid.UUID) -> ExtractionJob | None:
    job = session.get(ExtractionJob, job_id)
    if job is None or job.user_id != user_id:
        return None
    return job

def discard_job(session: Session, job: ExtractionJob) -> None:
    job.status = "discarded"
    for row in job.items:
        if row.status == "pending":
            row.status = "deleted"
    session.flush()

# Items

def get_item(job: ExtractionJob, item_id: uuid.UUID) -> ExtractedItemRow | None:
    return next((row for row in job.items if row.id == item_id), None)

def update_item(row: ExtractedItemRow, changes: dict[str, Any]) -> None:
    for name, value in changes.items():
        setattr(row, name, value)

def mark_imported(job: ExtractionJob, imported: dict[uuid.UUID, uuid.UUID]) -> int:
    count = 0
    for row in job.items:
        item_id = imported.get(row.id)
        if item_id is not None:
            row.status = "imported"
            row.imported_item_id = item_id
            count += 1
    return count

def item_row(position: int, item: ExtractedItem) -> ExtractedItemRow:
    return ExtractedItemRow(
        position=position,
        lemma=item.lemma,
        pos=item.pos,
        prompt=item.prompt,
        answer=item.answer,
        alternates=list(item.alternates),
        reading=None,
        notes=item.context or None,
        original=item.model_dump(mode="json"),
    )
