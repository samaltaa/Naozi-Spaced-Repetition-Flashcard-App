from __future__ import annotations

import pytest

from curator.languages import (
    ENGLISH,
    RUSSIAN,
    SPANISH,
    UnsupportedLanguage,
    find_profile,
    profile_for,
)
from curator.nlp.tokenize import candidates_from_text, citation_form, looks_foreign
from curator.schema import Candidate, fold, without_stress

# Profiles

def test_known_languages_have_profiles() -> None:
    assert profile_for("es") is SPANISH
    assert profile_for("en-GB") is ENGLISH
    assert profile_for("RU") is RUSSIAN

def test_languages_without_a_model_are_unsupported() -> None:
    assert find_profile("xx") is None
    with pytest.raises(UnsupportedLanguage):
        profile_for("xx")

# Foreign words

def test_english_words_look_foreign_in_spanish() -> None:
    assert looks_foreign("police", 3.05, SPANISH)
    assert not looks_foreign("radical", 4.38, SPANISH)
    assert not looks_foreign("local", 5.11, SPANISH)

def test_nothing_looks_foreign_in_english() -> None:
    assert not looks_foreign("police", 3.05, ENGLISH)

def test_english_sentences_are_ignored() -> None:
    text = (
        "La policía investigó el incendio de la mezquita durante varios días. "
        "The settlers were described as violent extremists by the police."
    )
    lemmas = {c.lemma for c in candidates_from_text(text, lang="es")}
    assert "mezquita" in lemmas
    assert not lemmas & {"settler", "violent", "extremist", "describir"}

# Context

def test_long_sentences_still_get_a_context() -> None:
    text = (
        "Durante aquellos años difíciles los campesinos de la región cultivaban trigo y cebada en "
        "terrenos pequeños que heredaban de sus abuelos y que apenas alcanzaban para alimentar a "
        "las familias numerosas que vivían en las aldeas de la montaña sin carreteras ni escuelas."
    )
    found = {c.lemma: c for c in candidates_from_text(text, lang="es")}
    assert found
    assert all(c.context for c in found.values())
    assert all(len(c.context.split()) <= 18 for c in found.values())

# Spanish

def test_spanish_nouns_get_their_article() -> None:
    noun = Candidate(lemma="casa", surface="casa", pos="noun", gender="feminine", zipf=5.0, context="")
    assert citation_form(noun, SPANISH) == "la casa"

def test_spanish_noun_ending_in_se_keeps_its_frequency() -> None:
    found = {c.lemma: c for c in candidates_from_text("La base militar fue reforzada durante la guerra.", lang="es")}
    assert found["base"].zipf > 4

# English

def test_english_phrasal_verbs_are_one_item() -> None:
    text = "She finally gave up smoking after the doctors looked after her for months."
    lemmas = {c.lemma for c in candidates_from_text(text, lang="en")}
    assert "give up" in lemmas
    assert "give" not in lemmas

def test_english_nouns_have_no_article() -> None:
    noun = Candidate(lemma="forest", surface="forests", pos="noun", zipf=4.7, context="")
    assert citation_form(noun, ENGLISH) == "forest"

# Russian

def test_russian_lemmas_and_genders() -> None:
    text = "Мальчики быстро бегали по старым улицам, а потом купили новое окно в магазине."
    found = {c.lemma: c for c in candidates_from_text(text, lang="ru")}
    assert {"мальчик", "бегать", "старый", "улица", "окно"} <= set(found)
    assert found["окно"].gender == "neuter"
    assert citation_form(found["улица"], RUSSIAN) == "улица"

def test_russian_ignores_latin_words() -> None:
    text = "Журналисты написали статью о компании Google и её новом продукте для школ."
    lemmas = {c.lemma for c in candidates_from_text(text, lang="ru")}
    assert not any(ch.isascii() for lemma in lemmas for ch in lemma)

def test_fold_keeps_short_i_apart() -> None:
    assert fold("мой") != fold("мои")
    assert fold("пошёл") == fold("пошел")
    assert fold("Canción") == "cancion"

def test_stress_marks_are_removable() -> None:
    assert without_stress("молоко́") == "молоко"

def test_abbreviations_are_skipped() -> None:
    text = "Доктрина Дахия (англ. Dahiya doctrine) — военная стратегия, которую применяет армия."
    lemmas = {c.lemma for c in candidates_from_text(text, lang="ru")}
    assert "англ" not in lemmas
    assert "стратегия" in lemmas

def test_chinese_words_and_contexts() -> None:
    text = "近年来，这座城市的交通问题越来越严重，政府决定扩建地铁系统，并鼓励市民骑自行车上班。北京是中国的首都。"
    found = {c.lemma: c for c in candidates_from_text(text, lang="zh")}
    assert "自行车" in found
    assert "北京" not in found
    assert " " not in found["自行车"].context
    assert len(found["自行车"].context) < len(text)

def test_traditional_text_is_segmented_as_simplified() -> None:
    text = "幾何學是研究空間結構及性質的一門學科。黎曼在書中引入了流形的概念。"
    lemmas = {c.lemma for c in candidates_from_text(text, lang="zh")}
    assert "幾何學" in lemmas
    assert "學" not in lemmas
    assert not any(ch in lemma for lemma in lemmas for ch in "学间构")

def test_traditional_contexts_keep_original_characters() -> None:
    text = "黎曼在書中引入了流形的概念，數學家研究曲率。"
    found = {c.lemma: c for c in candidates_from_text(text, lang="zh")}
    assert "數學家" in found["概念"].context
