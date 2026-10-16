from __future__ import annotations

from curator.nlp.tokenize import candidates_from_text, looks_foreign

# Foreign words

def test_english_words_look_foreign_in_spanish() -> None:
    assert looks_foreign("police", 3.05, "es")
    assert not looks_foreign("radical", 4.38, "es")
    assert not looks_foreign("local", 5.11, "es")

def test_nothing_looks_foreign_in_english() -> None:
    assert not looks_foreign("police", 3.05, "en")

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
