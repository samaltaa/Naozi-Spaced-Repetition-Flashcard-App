from __future__ import annotations

import json
from collections.abc import Iterator
from decimal import Decimal

import pytest
from anthropic import APIConnectionError
from httpx import Request

from curator import extract
from curator.config import get_settings
from curator.extract import (
    BatchUsage,
    Rejection,
    Translation,
    TranslationKey,
    build_item,
    candidates_payload,
    extract_from_text,
    translation_key,
)
from curator.languages import RUSSIAN, SPANISH
from curator.nlp.tokenize import citation_form
from curator.schema import Candidate

# Helpers

def candidate(lemma: str, pos: str = "noun", gender: str | None = None, context: str = "") -> Candidate:
    return Candidate(
        lemma=lemma,
        surface=lemma,
        pos=pos,  # type: ignore[arg-type]
        gender=gender,  # type: ignore[arg-type]
        zipf=3.0,
        context=context or f"Una frase con {lemma} dentro.",
    )

CANDIDATES = [
    candidate("guiso", gender="masculine"),
    candidate("agua", gender="feminine"),
    candidate("amasar", pos="verb"),
    candidate("madrid", gender="masculine"),
]

class MemoryStore:
    def __init__(self, entries: list[Translation] | None = None) -> None:
        self.entries = {translation_key(t.lemma, t.pos): t for t in entries or []}
        self.saved: list[Translation] = []

    def lookup(self, candidates: list[Candidate]) -> dict[TranslationKey, Translation]:
        wanted = {translation_key(c.lemma, c.pos) for c in candidates}
        return {k: v for k, v in self.entries.items() if k in wanted}

    def save(self, translations: list[Translation]) -> None:
        self.saved.extend(translations)
        self.entries.update({translation_key(t.lemma, t.pos): t for t in translations})

REPLIES = {
    "guiso": Translation(lemma="guiso", pos="noun", gloss="stew"),
    "agua": Translation(lemma="agua", pos="noun", gloss="water", form="el agua"),
    "amasar": Translation(lemma="amasar", pos="verb", gloss="to knead"),
    "madrid": Translation(lemma="madrid", pos="noun", gloss="", skip_reason="proper noun"),
}

@pytest.fixture
def fake_model(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[list[str]]]:
    calls: list[list[str]] = []

    def fake_request(client: object, group: list[Candidate], system: str, model: str, profile: object = None):
        calls.append([c.lemma for c in group])
        found = [REPLIES[c.lemma] for c in group if c.lemma in REPLIES]
        missing = [Rejection(lemma=c.lemma, reason="no reply from the model") for c in group if c.lemma not in REPLIES]
        usage = BatchUsage(size=len(group), input_tokens=100, output_tokens=10 * len(group), model=model)
        return found, missing, usage

    monkeypatch.setattr(extract, "request_batch", fake_request)
    monkeypatch.setattr(extract, "build_client", lambda: object())
    monkeypatch.setattr(extract, "candidates_from_text", lambda text, lang: list(CANDIDATES))
    yield calls

# Citation forms

def test_citation_form_adds_article_from_gender() -> None:
    assert citation_form(candidate("casa", gender="feminine")) == "la casa"
    assert citation_form(candidate("problema", gender="masculine")) == "el problema"

def test_citation_form_without_gender_is_the_lemma() -> None:
    assert citation_form(candidate("casa")) == "casa"
    assert citation_form(candidate("comer", pos="verb")) == "comer"

# Requests

def test_payload_is_compact_and_numbered() -> None:
    payload = candidates_payload(CANDIDATES[:2])
    assert ", " not in payload and "\n" not in payload
    data = json.loads(payload)
    assert [d["id"] for d in data] == [1, 2]
    assert data[0]["form"] == "el guiso"
    assert set(data[0]) == {"id", "lemma", "pos", "form", "sentence"}

# Building items

def test_build_item_uses_default_form_and_adds_bare_alternate() -> None:
    item = build_item(CANDIDATES[0], REPLIES["guiso"])
    assert item.answer == "el guiso"
    assert item.prompt == "stew"
    assert item.alternates == ["guiso"]
    assert item.context == CANDIDATES[0].context

def test_build_item_prefers_the_model_correction() -> None:
    item = build_item(CANDIDATES[1], REPLIES["agua"])
    assert item.answer == "el agua"
    assert item.alternates == ["agua"]

def test_build_item_rejects_an_empty_gloss() -> None:
    with pytest.raises(ValueError):
        build_item(CANDIDATES[0], Translation(lemma="guiso", pos="noun", gloss=""))

# Extraction

def test_extract_splits_items_and_skips(fake_model: list[list[str]]) -> None:
    result = extract_from_text("texto")
    assert [i.answer for i in result.items] == ["el guiso", "el agua", "amasar"]
    assert [s.lemma for s in result.skipped] == ["madrid"]
    assert result.input_tokens == 100
    assert len(result.batches) == 1
    assert result.model_called

def test_second_run_is_served_from_the_store(fake_model: list[list[str]]) -> None:
    store = MemoryStore()
    extract_from_text("texto", store=store)
    second = extract_from_text("texto", store=store)

    assert len(fake_model) == 1
    assert second.cached_items == 4
    assert second.input_tokens == 0
    assert not second.model_called
    assert [i.answer for i in second.items] == ["el guiso", "el agua", "amasar"]

def test_only_missing_words_are_sent(fake_model: list[list[str]]) -> None:
    store = MemoryStore([REPLIES["guiso"], REPLIES["agua"]])
    result = extract_from_text("texto", store=store)
    assert fake_model == [["amasar", "madrid"]]
    assert result.cached_items == 2

def test_invalid_translations_are_not_cached(fake_model: list[list[str]], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(REPLIES, "amasar", Translation(lemma="amasar", pos="verb", gloss=""))
    store = MemoryStore()
    result = extract_from_text("texto", store=store)
    assert [r.lemma for r in result.rejected] == ["amasar"]
    assert "amasar" not in {t.lemma for t in store.saved}
    assert "madrid" in {t.lemma for t in store.saved}

def test_known_words_are_dropped_before_the_cap(fake_model: list[list[str]]) -> None:
    result = extract_from_text("texto", known_lemmas={"guiso", "agua"})
    assert fake_model == [["amasar", "madrid"]]
    assert result.known_dropped == 2

def test_payload_leaves_out_empty_sentences() -> None:
    bare = Candidate(lemma="colina", surface="colina", pos="noun", gender="feminine", zipf=3.9, context="")
    data = json.loads(candidates_payload([bare, CANDIDATES[0]]))
    assert "sentence" not in data[0]
    assert data[1]["sentence"] == CANDIDATES[0].context

def test_same_spelling_words_are_cached_skips(fake_model: list[list[str]], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(REPLIES, "amasar", Translation(lemma="amasar", pos="verb", gloss="Amasar"))
    store = MemoryStore()
    first = extract_from_text("texto", store=store)
    second = extract_from_text("texto", store=store)

    assert "amasar" in {s.lemma for s in first.skipped}
    assert "amasar" not in {r.lemma for r in first.rejected}
    assert len(fake_model) == 1
    assert not second.model_called

# Model fallback

def flaky(failing: set[str]):
    calls: list[str] = []

    def fake_request(client: object, group: list[Candidate], system: str, model: str, profile: object = None):
        calls.append(model)
        if model in failing:
            raise APIConnectionError(request=Request("POST", "https://api.anthropic.com"))
        found = [REPLIES[c.lemma] for c in group if c.lemma in REPLIES]
        return found, [], BatchUsage(size=len(group), input_tokens=1000, output_tokens=1000, model=model)

    return fake_request, calls

@pytest.fixture
def chain(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "extraction_model", "claude-haiku-5-5")
    monkeypatch.setattr(get_settings(), "fallback_models", "claude-sonnet-4-6")
    monkeypatch.setattr(extract, "build_client", lambda: object())
    monkeypatch.setattr(extract, "candidates_from_text", lambda text, lang: list(CANDIDATES))

def test_primary_model_is_used_when_it_works(chain: None, monkeypatch: pytest.MonkeyPatch) -> None:
    fake, calls = flaky(set())
    monkeypatch.setattr(extract, "request_batch", fake)
    result = extract_from_text("texto")
    assert calls == ["claude-haiku-5-5"]
    assert result.batches[0].model == "claude-haiku-5-5"
    assert result.batches[0].failed_models == []

def test_falls_back_to_the_next_model(chain: None, monkeypatch: pytest.MonkeyPatch) -> None:
    fake, calls = flaky({"claude-haiku-5-5"})
    monkeypatch.setattr(extract, "request_batch", fake)
    result = extract_from_text("texto")
    assert calls == ["claude-haiku-5-5", "claude-sonnet-4-6"]
    assert result.batches[0].model == "claude-sonnet-4-6"
    assert result.batches[0].failed_models == ["claude-haiku-5-5"]
    assert len(result.items) == 3

def test_cost_uses_the_model_that_answered(chain: None, monkeypatch: pytest.MonkeyPatch) -> None:
    fake, _ = flaky({"claude-haiku-5-5"})
    monkeypatch.setattr(extract, "request_batch", fake)
    assert extract_from_text("texto").cost_usd == Decimal("0.018")

def test_every_model_failing_fails_the_batch(chain: None, monkeypatch: pytest.MonkeyPatch) -> None:
    fake, calls = flaky({"claude-haiku-5-5", "claude-sonnet-4-6"})
    monkeypatch.setattr(extract, "request_batch", fake)
    result = extract_from_text("texto")
    assert result.failed_batches == 1
    assert not result.items
    assert {r.reason for r in result.rejected} == {"every model failed"}
    assert calls == ["claude-haiku-5-5", "claude-sonnet-4-6"]

def test_model_chain_has_no_duplicates() -> None:
    from curator.config import Settings

    settings = Settings(extraction_model="a", fallback_models="b, a, ,c")
    assert settings.model_chain == ["a", "b", "c"]

# Reflexives

def test_dropped_reflexive_is_accepted() -> None:
    requerirse = candidate("requerirse", pos="verb")
    item = build_item(requerirse, Translation(lemma="requerirse", pos="verb", gloss="to require", form="requerir"))
    assert item.answer == "requerir"
    assert item.lemma == "requerir"
    assert item.alternates == []

def test_kept_reflexive_is_unchanged() -> None:
    darse = candidate("levantarse", pos="verb")
    item = build_item(darse, Translation(lemma="levantarse", pos="verb", gloss="to get up"))
    assert item.answer == "levantarse"
    assert item.lemma == "levantarse"

def test_words_with_the_same_answer_appear_once(fake_model: list[list[str]], monkeypatch: pytest.MonkeyPatch) -> None:
    both = [candidate("atacar", pos="verb"), candidate("atacarse", pos="verb")]
    monkeypatch.setattr(extract, "candidates_from_text", lambda text, lang: list(both))
    monkeypatch.setitem(REPLIES, "atacar", Translation(lemma="atacar", pos="verb", gloss="to attack"))
    monkeypatch.setitem(REPLIES, "atacarse", Translation(lemma="atacarse", pos="verb", gloss="to attack", form="atacar"))
    store = MemoryStore()
    result = extract_from_text("texto", store=store)
    assert [i.answer for i in result.items] == ["atacar"]
    assert {t.lemma for t in store.saved} == {"atacar", "atacarse"}

# Readings

def test_valid_stress_reading_is_kept() -> None:

    noun = candidate("молоко", gender="neuter")
    item = build_item(noun, Translation(lemma="молоко", pos="noun", gloss="milk", reading="молоко́"), RUSSIAN)
    assert item.answer == "молоко"
    assert item.reading == "молоко́"

def test_reading_with_different_letters_is_dropped() -> None:

    noun = candidate("молоко", gender="neuter")
    item = build_item(noun, Translation(lemma="молоко", pos="noun", gloss="milk", reading="мо́локо́в"), RUSSIAN)
    assert item.reading is None

def test_readings_are_ignored_for_spanish() -> None:
    item = build_item(CANDIDATES[0], Translation(lemma="guiso", pos="noun", gloss="stew", reading="guíso"))
    assert item.reading is None

# Readings

def test_one_syllable_words_need_no_reading() -> None:
    assert not extract.needs_reading("штаб", RUSSIAN)
    assert extract.needs_reading("боевой", RUSSIAN)
    assert extract.needs_reading("чай с молоком", RUSSIAN)

def test_readings_come_from_the_reading_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "reading_model", "claude-sonnet-4-6")
    sent: list[list[str]] = []

    def fake_readings(client: object, words: list[str], system: str, model: str):
        sent.append(words)
        return {1: "боево́й"}, BatchUsage(size=len(words), input_tokens=10, output_tokens=5, model=model, purpose="reading")

    monkeypatch.setattr(extract, "request_readings", fake_readings)
    candidates = [candidate("боевой", pos="adjective"), candidate("штаб")]
    translations = [
        Translation(lemma="боевой", pos="adjective", gloss="combat"),
        Translation(lemma="штаб", pos="noun", gloss="headquarters"),
    ]
    result = extract.ExtractionResult()
    updated = extract.add_readings(object(), translations, candidates, RUSSIAN, "Russian", result)

    assert sent == [["боевой"]]
    assert updated[0].reading == "боево́й"
    assert updated[1].reading is None
    assert result.batches[0].purpose == "reading"

def test_failed_readings_keep_the_translations(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(client: object, words: list[str], system: str, model: str):
        raise APIConnectionError(request=Request("POST", "https://api.anthropic.com"))

    monkeypatch.setattr(extract, "request_readings", broken)
    translations = [Translation(lemma="боевой", pos="adjective", gloss="combat")]
    result = extract.ExtractionResult()
    updated = extract.add_readings(object(), translations, [candidate("боевой", pos="adjective")], RUSSIAN, "Russian", result)
    assert updated == translations
    assert not result.batches

def test_readings_are_skipped_for_spanish() -> None:
    translations = [Translation(lemma="guiso", pos="noun", gloss="stew")]
    result = extract.ExtractionResult()
    assert extract.add_readings(object(), translations, CANDIDATES, SPANISH, "Spanish", result) == translations

def test_chinese_readings_are_pinyin() -> None:
    from curator.languages import CHINESE

    item = build_item(candidate("银行"), Translation(lemma="银行", pos="noun", gloss="bank"), CHINESE)
    assert item.reading == "yínháng"
    assert item.answer == "银行"

def test_traditional_characters_get_correct_pinyin() -> None:
    assert extract.pinyin_of("長度") == "chángdù"
    assert extract.pinyin_of("銀行") == "yínháng"

def test_persian_broken_plural_takes_the_singular() -> None:
    from curator.languages import PERSIAN

    plural = candidate("انواع")
    item = build_item(plural, Translation(lemma="انواع", pos="noun", gloss="type, kind", form="نوع"), PERSIAN)
    assert item.answer == "نوع"
    assert item.lemma == "نوع"
    assert item.alternates == []

def test_unrelated_form_is_still_rejected_outside_persian() -> None:
    with pytest.raises(ValueError):
        build_item(candidate("guiso"), Translation(lemma="guiso", pos="noun", gloss="stew", form="el estofado"))
