from __future__ import annotations

from decimal import Decimal

from curator.config import Settings
from curator.extract import ExtractionResult, Rejection
from curator.jobs import content_hash, result_from_dict, result_to_dict
from curator.known import drop_known, known_keys, term_key
from curator.pricing import cost_usd
from curator.schema import ExtractedItem

# Helpers

def item(lemma: str, answer: str, prompt: str = "x") -> ExtractedItem:
    return ExtractedItem(lemma=lemma, answer=answer, prompt=prompt, pos="noun")

# Pricing

def test_cost_for_known_model() -> None:
    assert cost_usd("claude-sonnet-4-6", 12_000, 6_000) == Decimal("0.126000")

def test_cost_for_unknown_model_is_none() -> None:
    assert cost_usd("some-other-model", 1_000, 1_000) is None

# Known terms

def test_term_key_strips_articles_and_accents() -> None:
    assert term_key("La Canción", "es") == "cancion"
    assert term_key("los  árboles", "es") == "arboles"

def test_term_key_keeps_articles_for_other_languages() -> None:
    assert term_key("la casa", "en") == "la casa"

def test_term_key_strips_elision() -> None:
    assert term_key("l'école", "fr") == "ecole"

def test_single_word_that_is_an_article_is_kept() -> None:
    assert term_key("la", "es") == "la"

def test_drop_known_matches_lemma_or_answer() -> None:
    known = known_keys(["la casa", "comer", ""], "es")
    items = [
        item("casa", "la casa", "house"),
        item("comer", "comer", "to eat"),
        item("guiso", "el guiso", "stew"),
    ]
    fresh, dropped = drop_known(items, known, "es")
    assert [i.lemma for i in fresh] == ["guiso"]
    assert [i.lemma for i in dropped] == ["casa", "comer"]

# Hashing

def test_content_hash_ignores_whitespace_and_normalization() -> None:
    composed = "canción  de\ncuna"
    decomposed = "canción de cuna "
    assert content_hash(composed) == content_hash(decomposed)
    assert len(content_hash(composed)) == 64

def test_content_hash_is_case_sensitive() -> None:
    assert content_hash("Casa") != content_hash("casa")

# Serialization

def test_result_round_trip() -> None:
    result = ExtractionResult(
        items=[item("guiso", "el guiso", "stew")],
        skipped=[Rejection(lemma="respondía", reason="conjugated form")],
        rejected=[Rejection(lemma="paño", reason="context missing")],
        input_tokens=100,
        output_tokens=50,
        prompt_version="1",
    )
    restored = result_from_dict(result_to_dict(result))
    assert restored.items == result.items
    assert restored.skipped == result.skipped
    assert restored.rejected == result.rejected
    assert restored.input_tokens == 100
    assert restored.prompt_version == "1"

# Config

def test_sqlalchemy_url_uses_psycopg() -> None:
    settings = Settings(database_url="postgresql://u:p@host:5432/postgres")
    assert settings.sqlalchemy_url == "postgresql+psycopg://u:p@host:5432/postgres"
    assert Settings(database_url="postgres://u:p@h/db").sqlalchemy_url.startswith("postgresql+psycopg://")
