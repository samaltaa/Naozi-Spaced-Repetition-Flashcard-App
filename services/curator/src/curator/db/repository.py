from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from curator.db.models import ExtractedItemRow, ExtractionJob, TranslationRow
from curator.extract import Translation, TranslationKey, translation_key
from curator.schema import Candidate, ExtractedItem

# Job key

@dataclass(frozen=True)
class JobKey:
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
    def from_job(cls, job: ExtractionJob) -> JobKey:
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

# Translations

class DbTranslationStore:
    def __init__(self, session: Session, key: JobKey) -> None:
        self.session = session
        self.key = key

    def scope(self) -> tuple[Any, ...]:
        return (
            TranslationRow.lang == self.key.lang,
            TranslationRow.source_language == self.key.source_language,
            TranslationRow.prompt_version == self.key.prompt_version,
        )

    def lookup(self, candidates: list[Candidate]) -> dict[TranslationKey, Translation]:
        wanted = {translation_key(c.lemma, c.pos) for c in candidates}
        lemmas = sorted({c.lemma for c in candidates})
        rows = self.session.scalars(
            select(TranslationRow).where(*self.scope(), TranslationRow.lemma.in_(lemmas))
        ).all()

        found: dict[TranslationKey, Translation] = {}
        for row in rows:
            key = translation_key(row.lemma, row.pos)
            if key not in wanted:
                continue
            found[key] = Translation(
                lemma=row.lemma,
                pos=row.pos,
                gloss=row.gloss,
                form=row.form,
                alternates=tuple(row.alternates),
                skip_reason=row.skip_reason,
                model=row.model,
            )

        if rows:
            self.session.execute(
                update(TranslationRow)
                .where(TranslationRow.id.in_([row.id for row in rows]))
                .values(hit_count=TranslationRow.hit_count + 1)
            )
        self.session.commit()
        return found

    def save(self, translations: list[Translation]) -> None:
        if not translations:
            return
        statement = (
            insert(TranslationRow)
            .values(
                [
                    {
                        "lang": self.key.lang,
                        "source_language": self.key.source_language,
                        "prompt_version": self.key.prompt_version,
                        "model": t.model or self.key.model,
                        "lemma": t.lemma,
                        "pos": t.pos,
                        "gloss": t.gloss,
                        "form": t.form,
                        "alternates": list(t.alternates),
                        "skip_reason": t.skip_reason,
                    }
                    for t in translations
                ]
            )
            .on_conflict_do_nothing(constraint="translations_key")
        )
        self.session.execute(statement)
        self.session.commit()

# Jobs

def create_job(
    session: Session,
    user_id: uuid.UUID,
    key: JobKey,
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
    cached_items: int,
    batches: list[dict[str, Any]],
    skipped: list[dict[str, str]],
    rejected: list[dict[str, str]],
) -> None:
    job.status = "done"
    job.cache_hit = cache_hit
    job.input_tokens = input_tokens
    job.output_tokens = output_tokens
    job.cost_usd = cost_usd
    job.known_dropped = known_dropped
    job.cached_items = cached_items
    job.batches = batches
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
