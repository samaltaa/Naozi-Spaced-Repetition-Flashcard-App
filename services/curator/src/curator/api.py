from __future__ import annotations

import hmac
import logging
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    status,
)
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from sqlalchemy.orm import Session

from curator.config import get_settings
from curator.db import repository
from curator.db.models import ExtractedItemRow, ExtractionJob
from curator.db.session import get_sessionmaker, session_scope
from curator.jobs import process_job, submit_job
from curator.nlp.tokenize import MODELS
from curator.schema import MAX_ALTERNATES, MAX_ANSWER, MAX_NOTES, MAX_PROMPT
from curator.sources import fetch

logger = logging.getLogger(__name__)

app = FastAPI(title="naozi curator", docs_url=None, redoc_url=None, openapi_url=None)

# Auth

def require_token(x_curator_token: Annotated[str, Header()] = "") -> None:
    expected = get_settings().service_token
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "SERVICE_TOKEN is not configured")
    if not hmac.compare_digest(x_curator_token.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid service token")

def get_session():
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()

Authorized = Depends(require_token)
SessionDep = Annotated[Session, Depends(get_session)]
UserId = Annotated[uuid.UUID, Query()]

# Request bodies

def clean_text(value: str) -> str:
    return " ".join(value.split())

class SubmitJob(BaseModel):
    user_id: uuid.UUID
    url: HttpUrl | None = None
    text: str | None = Field(default=None, max_length=fetch.MAX_CHARS * 2)
    lang: str = Field(min_length=2, max_length=15)
    source_language: str = Field(min_length=1, max_length=60)
    target_language: str = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def one_source(self) -> SubmitJob:
        has_text = bool(self.text and self.text.strip())
        if bool(self.url) == has_text:
            raise ValueError("send either url or text")
        return self

class UpdateDraft(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=MAX_PROMPT)
    answer: str | None = Field(default=None, min_length=1, max_length=MAX_ANSWER)
    alternates: list[str] | None = Field(default=None, max_length=MAX_ALTERNATES)
    notes: str | None = Field(default=None, max_length=MAX_NOTES)
    status: Literal["pending", "deleted"] | None = None

    @field_validator("prompt", "answer", "notes")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return None if value is None else clean_text(value)

    @field_validator("alternates")
    @classmethod
    def clean_alternates(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return [clean_text(v) for v in values if v.strip() and len(v) <= MAX_ANSWER]

class ImportedItem(BaseModel):
    draft_id: uuid.UUID
    item_id: uuid.UUID

class MarkImported(BaseModel):
    items: list[ImportedItem] = Field(min_length=1, max_length=200)

# Responses

class DraftView(BaseModel):
    id: uuid.UUID
    position: int
    lemma: str
    pos: str
    prompt: str
    answer: str
    alternates: list[str]
    notes: str | None
    status: str
    edited: bool

class JobView(BaseModel):
    id: uuid.UUID
    status: str
    source_url: str | None
    lang: str
    error: str | None
    cache_hit: bool
    known_dropped: int
    created_at: datetime
    finished_at: datetime | None
    items: list[DraftView]

def was_edited(row: ExtractedItemRow) -> bool:
    original = row.original
    return (
        row.prompt != original.get("prompt")
        or row.answer != original.get("answer")
        or list(row.alternates) != list(original.get("alternates", []))
        or (row.notes or "") != (original.get("context") or "")
    )

def draft_view(row: ExtractedItemRow) -> DraftView:
    return DraftView(
        id=row.id,
        position=row.position,
        lemma=row.lemma,
        pos=row.pos,
        prompt=row.prompt,
        answer=row.answer,
        alternates=list(row.alternates),
        notes=row.notes,
        status=row.status,
        edited=was_edited(row),
    )

def job_view(job: ExtractionJob) -> JobView:
    return JobView(
        id=job.id,
        status=job.status,
        source_url=job.source_url,
        lang=job.lang,
        error=public_error(job.error),
        cache_hit=job.cache_hit,
        known_dropped=job.known_dropped,
        created_at=job.created_at,
        finished_at=job.finished_at,
        items=[draft_view(row) for row in job.items],
    )

def public_error(error: str | None) -> str | None:
    if error is None:
        return None
    return "The words could not be extracted. Try again, or paste the text instead of a link."

def load_job(session: Session, job_id: uuid.UUID, user_id: uuid.UUID) -> ExtractionJob:
    job = repository.get_user_job(session, job_id, user_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Extraction not found")
    return job

# Background work

def run_in_background(job_id: uuid.UUID, text: str) -> None:
    with session_scope() as session:
        try:
            process_job(session, job_id, text)
        except Exception:
            logger.exception("extraction job %s failed", job_id)

# Routes

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.post("/jobs", status_code=status.HTTP_202_ACCEPTED, dependencies=[Authorized])
def create_job(body: SubmitJob, session: SessionDep, background: BackgroundTasks) -> JobView:
    lang = body.lang.lower().split("-")[0]
    if lang not in MODELS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Articles in '{lang}' are not supported yet")

    url = str(body.url) if body.url else None
    try:
        text = fetch.from_url(url) if url else fetch.clean(body.text or "")
    except RuntimeError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error

    job_id = submit_job(
        session,
        body.user_id,
        text,
        source_url=url,
        target_language=body.target_language,
        source_language=body.source_language,
        lang=lang,
    )
    background.add_task(run_in_background, job_id, text)
    return job_view(load_job(session, job_id, body.user_id))

@app.get("/jobs/{job_id}", dependencies=[Authorized])
def read_job(job_id: uuid.UUID, user_id: UserId, session: SessionDep) -> JobView:
    return job_view(load_job(session, job_id, user_id))

@app.patch("/jobs/{job_id}/items/{item_id}", dependencies=[Authorized])
def edit_draft(
    job_id: uuid.UUID,
    item_id: uuid.UUID,
    user_id: UserId,
    body: UpdateDraft,
    session: SessionDep,
) -> DraftView:
    job = load_job(session, job_id, user_id)
    if job.status != "done":
        raise HTTPException(status.HTTP_409_CONFLICT, "This extraction can no longer be edited")
    row = repository.get_item(job, item_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Word not found")
    if row.status == "imported":
        raise HTTPException(status.HTTP_409_CONFLICT, "This word was already added")

    changes = body.model_dump(exclude_unset=True)
    if changes.get("prompt") == "" or changes.get("answer") == "":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Words and translations cannot be empty")
    if "notes" in changes and not changes["notes"]:
        changes["notes"] = None
    repository.update_item(row, changes)
    session.commit()
    return draft_view(row)

@app.post("/jobs/{job_id}/discard", dependencies=[Authorized])
def discard(job_id: uuid.UUID, user_id: UserId, session: SessionDep) -> JobView:
    job = load_job(session, job_id, user_id)
    if job.status in ("queued", "running"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Wait for the extraction to finish")
    repository.discard_job(session, job)
    session.commit()
    return job_view(job)

@app.post("/jobs/{job_id}/imported", dependencies=[Authorized])
def imported(job_id: uuid.UUID, user_id: UserId, body: MarkImported, session: SessionDep) -> JobView:
    job = load_job(session, job_id, user_id)
    repository.mark_imported(job, {entry.draft_id: entry.item_id for entry in body.items})
    session.commit()
    return job_view(job)
