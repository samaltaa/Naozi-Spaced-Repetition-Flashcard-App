from __future__ import annotations

import functools
from collections import defaultdict

import spacy
from spacy.language import Language
from spacy.tokens import Doc, Span, Token
from wordfreq import zipf_frequency

from curator.schema import Candidate, Gender, PartOfSpeech, fold

# Configuration

MODELS = {"es": "es_core_news_md"}

KEEP_POS: dict[str, PartOfSpeech] = {
    "NOUN": "noun",
    "VERB": "verb",
    "ADJ": "adjective",
    "ADV": "adverb",
}

MIN_ZIPF = 2.5
MAX_ZIPF = 5.5
MIN_LENGTH = 3
MAX_CONTEXT_WORDS = 40

# Model loading

@functools.lru_cache(maxsize=4)
def load_model(lang: str) -> Language:
    name = MODELS.get(lang)
    if name is None:
        raise ValueError(f"No spaCy model configured for '{lang}'")
    return spacy.load(name)

# Token filters

def is_candidate(token: Token) -> bool:
    if token.pos_ not in KEEP_POS:
        return False
    if token.is_stop or token.is_punct or token.is_digit or token.like_num or token.like_url:
        return False
    if token.pos_ == "AUX":
        return False
    if not token.lemma_ or not token.lemma_.isalpha():
        return False
    if len(token.lemma_) < MIN_LENGTH:
        return False
    if token.ent_type_ in {"PER", "ORG", "LOC", "MISC"}:
        return False
    return True

def gender_of(token: Token) -> Gender | None:
    if token.pos_ != "NOUN":
        return None
    values = token.morph.get("Gender")
    if values == ["Masc"]:
        return "masculine"
    if values == ["Fem"]:
        return "feminine"
    return None

def is_reflexive(token: Token) -> bool:
    return any(child.dep_ == "obj" and child.lower_ in {"se", "me", "te", "nos", "os"} for child in token.children)

# Context

def context_of(token: Token) -> str:
    sentence: Span = token.sent
    words = sentence.text.split()
    if len(words) > MAX_CONTEXT_WORDS:
        return ""
    return " ".join(words)

# Extraction

def candidates_from_text(text: str, lang: str = "es") -> list[Candidate]:
    nlp = load_model(lang)
    doc: Doc = nlp(text)

    grouped: dict[str, list[Token]] = defaultdict(list)
    for token in doc:
        if is_candidate(token):
            lemma = token.lemma_.lower()
            if token.pos_ == "VERB" and is_reflexive(token):
                lemma = f"{lemma}se"
            grouped[lemma].append(token)

    candidates: list[Candidate] = []
    for lemma, tokens in grouped.items():
        zipf = zipf_frequency(lemma.removesuffix("se") if lemma.endswith("se") else lemma, lang)
        if zipf < MIN_ZIPF or zipf > MAX_ZIPF:
            continue

        first = tokens[0]
        context = next((c for c in (context_of(t) for t in tokens) if c), "")

        candidates.append(
            Candidate(
                lemma=lemma,
                surface=first.text,
                pos=KEEP_POS[first.pos_],
                gender=gender_of(first),
                zipf=zipf,
                context=context,
                occurrences=len(tokens),
            )
        )

    return candidates

# Ranking and filtering

def rank_candidates(
    candidates: list[Candidate],
    known_lemmas: set[str] | None = None,
    limit: int = 60,
) -> list[Candidate]:
    known = known_lemmas or set()
    fresh = [c for c in candidates if fold(c.lemma) not in known]
    fresh.sort(key=lambda c: (-c.occurrences, -c.zipf))
    return fresh[:limit]