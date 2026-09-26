from __future__ import annotations

import functools
from collections import defaultdict

import spacy
from spacy.language import Language
from spacy.tokens import Doc, Token
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

VERB_ENDINGS = ("ar", "er", "ir", "ár", "ér", "ír")
BREAKS = {",", ";", ":"}

MIN_ZIPF = 2.0
MAX_ZIPF = 5.5
MIN_LENGTH = 3
MIN_CONTEXT_WORDS = 4
MAX_CONTEXT_WORDS = 18
SALIENCE_CEILING = 6.5

# Model loading

@functools.lru_cache(maxsize=4)
def load_model(lang: str) -> Language:
    name = MODELS.get(lang)
    if name is None:
        raise ValueError(f"No spaCy model configured for '{lang}'")
    return spacy.load(name)

# Token filters

def has_infinitive_shape(lemma: str) -> bool:
    return lemma.removesuffix("se").endswith(VERB_ENDINGS)

def is_participle(token: Token) -> bool:
    return token.morph.get("VerbForm") == ["Part"]

def is_candidate(token: Token) -> bool:
    if token.pos_ not in KEEP_POS:
        return False
    if token.is_stop or token.is_punct or token.is_digit or token.like_num or token.like_url:
        return False
    if not token.lemma_ or not token.lemma_.isalpha():
        return False
    if len(token.lemma_) < MIN_LENGTH:
        return False
    if token.ent_type_:
        return False
    if token.pos_ == "ADJ" and is_participle(token):
        return False
    if token.pos_ == "VERB" and not has_infinitive_shape(token.lemma_.lower()):
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
    for child in token.children:
        if child.lower_ != "se":
            continue
        if child.dep_ in {"obj", "iobj", "expl:pv", "obl"} or child.morph.get("Reflex") == ["Yes"]:
            return True
    return False

# Context

def context_of(token: Token) -> str:
    doc = token.doc
    sentence = token.sent

    if len(sentence.text.split()) <= MAX_CONTEXT_WORDS:
        return " ".join(sentence.text.split())

    start, end = sentence.start, sentence.end
    for i in range(token.i, sentence.start - 1, -1):
        if doc[i].text in BREAKS:
            start = i + 1
            break
    for i in range(token.i, sentence.end):
        if doc[i].text in BREAKS:
            end = i
            break

    words = doc[start:end].text.split()
    if len(words) < MIN_CONTEXT_WORDS or len(words) > MAX_CONTEXT_WORDS:
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
        base = lemma.removesuffix("se") if lemma.endswith("se") else lemma
        zipf = zipf_frequency(base, lang)
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

# Ranking

def salience(candidate: Candidate) -> float:
    return candidate.occurrences * max(0.3, SALIENCE_CEILING - candidate.zipf)

def rank_candidates(
    candidates: list[Candidate],
    known_lemmas: set[str] | None = None,
    limit: int = 60,
) -> list[Candidate]:
    known = known_lemmas or set()
    fresh = [c for c in candidates if fold(c.lemma) not in known]
    fresh.sort(key=lambda c: (-salience(c), -c.occurrences))
    return fresh[:limit]