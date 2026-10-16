from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from curator.api import app, get_session
from curator.config import get_settings

TOKEN = "test-token"

# Fixtures

@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(get_settings(), "service_token", TOKEN)
    app.dependency_overrides[get_session] = lambda: None
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

def job_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "user_id": str(uuid.uuid4()),
        "text": "El guiso de mi abuela lleva tiempo.",
        "lang": "es",
        "source_language": "English",
        "target_language": "Spanish",
    }
    body.update(overrides)
    return body

# Auth

def test_health_needs_no_token(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}

def test_missing_token_is_rejected(client: TestClient) -> None:
    response = client.post("/jobs", json=job_body())
    assert response.status_code == 401

def test_wrong_token_is_rejected(client: TestClient) -> None:
    response = client.post("/jobs", json=job_body(), headers={"x-curator-token": "nope"})
    assert response.status_code == 401

def test_unconfigured_token_refuses_everything(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "service_token", "")
    response = client.post("/jobs", json=job_body(), headers={"x-curator-token": ""})
    assert response.status_code == 503

# Validation

def test_unsupported_language_is_rejected(client: TestClient) -> None:
    response = client.post("/jobs", json=job_body(lang="ja"), headers={"x-curator-token": TOKEN})
    assert response.status_code == 422
    assert "not supported" in response.json()["detail"]

def test_needs_exactly_one_source(client: TestClient) -> None:
    both = job_body(url="https://example.com/article")
    neither = job_body(text="   ")
    for body in (both, neither):
        response = client.post("/jobs", json=body, headers={"x-curator-token": TOKEN})
        assert response.status_code == 422
