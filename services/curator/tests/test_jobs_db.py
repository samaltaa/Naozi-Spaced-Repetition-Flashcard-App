from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, delete
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from curator.config import Settings
from curator.db.models import ContentCache, ExtractionJob
from curator.extract import ExtractionResult
from curator.jobs import content_hash, run_job
from curator.schema import ExtractedItem

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")

# Fixtures

@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(Settings(database_url=TEST_DATABASE_URL).sqlalchemy_url)
    with Session(engine, expire_on_commit=False) as db:
        yield db
    engine.dispose()

@pytest.fixture
def user_id(session: Session) -> uuid.UUID:
    found = session.execute(sql("select id from public.users order by created_at limit 1")).scalar()
    if found is None:
        pytest.skip("needs at least one user in public.users")
    return found

@pytest.fixture
def text() -> str:
    return f"El guiso de mi abuela lleva tiempo. {uuid.uuid4()}"

@pytest.fixture(autouse=True)
def cleanup(session: Session, text: str) -> Iterator[None]:
    yield
    session.rollback()
    hashed = content_hash(text)
    session.execute(delete(ExtractionJob).where(ExtractionJob.content_hash == hashed))
    session.execute(delete(ContentCache).where(ContentCache.content_hash == hashed))
    session.commit()

class FakeExtractor:
    def __init__(self, result: ExtractionResult) -> None:
        self.result = result
        self.calls = 0

    def __call__(self, text: str, **_: object) -> ExtractionResult:
        self.calls += 1
        return self.result

def stew() -> ExtractedItem:
    return ExtractedItem(
        lemma="guiso",
        answer="el guiso",
        prompt="stew",
        pos="noun",
        context="El guiso de mi abuela lleva tiempo.",
    )

# Jobs

def test_second_run_hits_the_cache(session: Session, user_id: uuid.UUID, text: str) -> None:
    extractor = FakeExtractor(
        ExtractionResult(items=[stew()], input_tokens=1000, output_tokens=500, prompt_version="1")
    )

    first = run_job(session, user_id, text, extractor=extractor)
    second = run_job(session, user_id, text, extractor=extractor)

    assert extractor.calls == 1
    assert not first.cache_hit and second.cache_hit
    assert second.cost_usd == Decimal(0)
    assert [i.answer for i in second.items] == ["el guiso"]

    job = session.get(ExtractionJob, first.job_id)
    assert job is not None
    assert job.status == "done"
    assert job.input_tokens == 1000
    assert [row.answer for row in job.items] == ["el guiso"]
    assert job.items[0].status == "pending"
    assert job.items[0].original["lemma"] == "guiso"

def test_failed_extraction_marks_job_failed(session: Session, user_id: uuid.UUID, text: str) -> None:
    def broken(text: str, **_: object) -> ExtractionResult:
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        run_job(session, user_id, text, extractor=broken)

    job = session.query(ExtractionJob).filter_by(content_hash=content_hash(text)).one()
    assert job.status == "failed"
    assert job.error == "RuntimeError: boom"
    assert job.finished_at is not None

def test_partial_batch_failure_is_not_cached(session: Session, user_id: uuid.UUID, text: str) -> None:
    extractor = FakeExtractor(ExtractionResult(items=[stew()], failed_batches=1))

    run_job(session, user_id, text, extractor=extractor)
    second = run_job(session, user_id, text, extractor=extractor)

    assert extractor.calls == 2
    assert not second.cache_hit
