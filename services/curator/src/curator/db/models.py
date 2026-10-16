from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Base

SCHEMA = "curator"

NAMING = {
    "ix": "%(table_name)s_%(column_0_name)s_idx",
    "uq": "%(table_name)s_%(column_0_name)s_key",
    "ck": "%(table_name)s_%(constraint_name)s_check",
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}

JOB_STATUSES = ("queued", "running", "done", "failed", "discarded")
ITEM_STATUSES = ("pending", "kept", "deleted", "imported")

def in_list(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} in ({quoted})"

class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA, naming_convention=NAMING)

def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

def created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

# Translations

class TranslationRow(Base):
    __tablename__ = "translations"
    __table_args__ = (
        UniqueConstraint(
            "lang",
            "source_language",
            "prompt_version",
            "lemma",
            "pos",
            name="translations_key",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    lang: Mapped[str] = mapped_column(Text, nullable=False)
    source_language: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    lemma: Mapped[str] = mapped_column(Text, nullable=False)
    pos: Mapped[str] = mapped_column(Text, nullable=False)
    gloss: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    form: Mapped[str | None] = mapped_column(Text)
    alternates: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    skip_reason: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = created_at()

# Extraction jobs

class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"
    __table_args__ = (
        CheckConstraint(in_list("status", JOB_STATUSES), name="status"),
        Index("extraction_jobs_user_created_idx", "user_id", "created_at"),
        Index(
            "extraction_jobs_queued_idx",
            "created_at",
            postgresql_where=text("status = 'queued'"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lang: Mapped[str] = mapped_column(Text, nullable=False)
    source_language: Mapped[str] = mapped_column(Text, nullable=False)
    target_language: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="queued")
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    item_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    known_dropped: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cached_items: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    batches: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    skipped: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    rejected: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list[ExtractedItemRow]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ExtractedItemRow.position",
    )

# Extracted items

class ExtractedItemRow(Base):
    __tablename__ = "extracted_items"
    __table_args__ = (
        CheckConstraint(in_list("status", ITEM_STATUSES), name="status"),
        UniqueConstraint("job_id", "position", name="extracted_items_job_position_key"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.extraction_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    lemma: Mapped[str] = mapped_column(Text, nullable=False)
    pos: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    alternates: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    reading: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    original: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    imported_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    job: Mapped[ExtractionJob] = relationship(back_populates="items")
