from __future__ import annotations

import os
import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, delete
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from curator.config import Settings
from curator.db.models import ExtractionJob, TranslationRow
from curator.db.repository import DbTranslationStore, JobKey
from curator.extract import BatchUsage, ExtractionResult, Translation, translation_key
from curator.jobs import content_hash, run_job
from curator.schema import Candidate, ExtractedItem

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")

TEST_PROMPT = "test"

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
    session.execute(delete(TranslationRow).where(TranslationRow.prompt_version == TEST_PROMPT))
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

def test_job_is_saved_with_drafts_and_usage(session: Session, user_id: uuid.UUID, text: str) -> None:
    extractor = FakeExtractor(
        ExtractionResult(
            items=[stew()],
            input_tokens=1000,
            output_tokens=500,
            cached_items=3,
            batches=[BatchUsage(size=4, input_tokens=1000, output_tokens=500)],
            prompt_version="2",
        )
    )

    outcome = run_job(session, user_id, text, extractor=extractor)

    job = session.get(ExtractionJob, outcome.job_id)
    assert job is not None
    assert job.status == "done"
    assert job.input_tokens == 1000
    assert job.cached_items == 3
    assert job.batches == [{"size": 4, "input_tokens": 1000, "output_tokens": 500}]
    assert not job.cache_hit
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

def test_all_batches_failing_fails_the_job(session: Session, user_id: uuid.UUID, text: str) -> None:
    extractor = FakeExtractor(ExtractionResult(failed_batches=1))

    with pytest.raises(RuntimeError):
        run_job(session, user_id, text, extractor=extractor)

    job = session.query(ExtractionJob).filter_by(content_hash=content_hash(text)).one()
    assert job.status == "failed"

# Translation store

def test_translation_store_round_trip(session: Session, text: str) -> None:
    key = JobKey(
        content_hash=content_hash(text),
        lang="es",
        source_language="English",
        target_language="Spanish",
        prompt_version=TEST_PROMPT,
        model="claude-sonnet-4-6",
        item_limit=60,
    )
    store = DbTranslationStore(session, key)
    guiso = Candidate(lemma="guiso", surface="guiso", pos="noun", zipf=3.0, context="")
    agua = Candidate(lemma="agua", surface="agua", pos="noun", zipf=3.0, context="")

    assert store.lookup([guiso, agua]) == {}

    store.save(
        [
            Translation(lemma="guiso", pos="noun", gloss="stew"),
            Translation(lemma="agua", pos="noun", gloss="water", form="el agua"),
        ]
    )
    store.save([Translation(lemma="guiso", pos="noun", gloss="something else")])

    found = store.lookup([guiso, agua])
    assert found[translation_key("guiso", "noun")].gloss == "stew"
    assert found[translation_key("agua", "noun")].form == "el agua"

    row = session.query(TranslationRow).filter_by(prompt_version=TEST_PROMPT, lemma="guiso").one()
    assert row.hit_count == 1
