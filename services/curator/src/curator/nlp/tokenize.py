from __future__ import annotations

import functools
import unicodedata
from collections import Counter, defaultdict

import spacy
from spacy.language import Language
from spacy.tokens import Doc, Span, Token
from opencc import OpenCC  # type: ignore[import-untyped]
from wordfreq import zipf_frequency

from curator.languages import SPANISH, LanguageProfile, profile_for
from curator.schema import Candidate, Gender, PartOfSpeech, fold

# Configuration

KEEP_POS: dict[str, PartOfSpeech] = {
    "NOUN": "noun",
    "VERB": "verb",
    "ADJ": "adjective",
    "ADV": "adverb",
}

GENDERS: dict[str, Gender] = {
    "Masc": "masculine",
    "Fem": "feminine",
    "Neut": "neuter",
}

BREAKS = {",", ";", ":", "，", "；", "：", "、"}

MIN_CONTEXT_WORDS = 4
MAX_CONTEXT_WORDS = 18
SALIENCE_CEILING = 6.5

FOREIGN_MARGIN = 1.0
FOREIGN_SENTENCE_SHARE = 0.5
MIN_SENTENCE_WORDS = 3

# Model loading

@functools.lru_cache(maxsize=8)
def load_model(name: str) -> Language:
    return spacy.load(name)

@functools.lru_cache(maxsize=1)
def simplifier() -> OpenCC:
    return OpenCC("t2s")

def to_simplified(text: str) -> str:
    return str(simplifier().convert(text))

# Source text

def parse(text: str, profile: LanguageProfile) -> Doc:
    nlp = load_model(profile.spacy_model)
    if not profile.parse_simplified:
        return nlp(text)
    simplified = to_simplified(text)
    if len(simplified) != len(text):
        return nlp(text)
    doc = nlp(simplified)
    doc.user_data["source"] = text
    return doc

def source_text(span: Span | Token) -> str:
    source = span.doc.user_data.get("source")
    if source is None:
        return span.text
    if isinstance(span, Token):
        return str(source[span.idx : span.idx + len(span.text)])
    return str(source[span.start_char : span.end_char])

# Token filters

def in_script(word: str, script: str | None) -> bool:
    if script is None:
        return True
    return all(unicodedata.name(ch, "").startswith(script) for ch in word if ch.isalpha())

def has_infinitive_shape(lemma: str, profile: LanguageProfile) -> bool:
    if not profile.verb_endings:
        return True
    stem = lemma.removesuffix(profile.reflexive_suffix) if profile.reflexive_suffix else lemma
    return stem.endswith(profile.verb_endings)

def base_lemma(token: Token) -> str:
    return token.lemma_ or source_text(token)

def is_participle(token: Token) -> bool:
    return token.morph.get("VerbForm", []) == ["Part"]

def is_abbreviation(token: Token) -> bool:
    if token.whitespace_ or token.i + 1 >= len(token.doc):
        return False
    period = token.doc[token.i + 1]
    return period.text == "." and period.i + 1 < period.sent.end

def is_candidate(token: Token, profile: LanguageProfile) -> bool:
    if token.pos_ not in KEEP_POS:
        return False
    if is_abbreviation(token):
        return False
    if token.is_stop or token.is_punct or token.is_digit or token.like_num or token.like_url:
        return False
    lemma = base_lemma(token)
    if not lemma or not lemma.isalpha() or len(lemma) < profile.min_length:
        return False
    if not in_script(lemma, profile.script):
        return False
    if token.ent_type_:
        return False
    if token.pos_ == "ADJ" and is_participle(token):
        return False
    return not (token.pos_ == "VERB" and not has_infinitive_shape(lemma.lower(), profile))

def gender_of(token: Token) -> Gender | None:
    if token.pos_ != "NOUN":
        return None
    values = token.morph.get("Gender", [])
    return GENDERS.get(values[0]) if len(values) == 1 else None

def is_reflexive(token: Token, profile: LanguageProfile) -> bool:
    if not profile.reflexive_pronouns:
        return False
    for child in token.children:
        if child.lower_ not in profile.reflexive_pronouns:
            continue
        if child.dep_ in {"obj", "iobj", "expl:pv", "obl"} or child.morph.get("Reflex", []) == ["Yes"]:
            return True
    return False

def phrasal_particle(token: Token, profile: LanguageProfile) -> str | None:
    if not profile.phrasal_verbs or token.pos_ != "VERB":
        return None
    return next((child.lower_ for child in token.children if child.dep_ == "prt"), None)

def lemma_of(token: Token, profile: LanguageProfile) -> str:
    lemma = base_lemma(token).lower()
    if token.pos_ == "VERB" and is_reflexive(token, profile):
        return f"{lemma}{profile.reflexive_suffix}"
    particle = phrasal_particle(token, profile)
    if particle:
        return f"{lemma} {particle}"
    return lemma

def frequency_base(lemma: str, pos: str, profile: LanguageProfile) -> str:
    suffix = profile.reflexive_suffix
    if pos == "VERB" and suffix and lemma.endswith(suffix):
        return lemma.removesuffix(suffix)
    return lemma

# Citation forms

def citation_form(candidate: Candidate, profile: LanguageProfile = SPANISH) -> str:
    article = profile.noun_articles.get(candidate.gender or "")
    if candidate.pos == "noun" and article:
        return f"{article} {candidate.lemma}"
    return candidate.lemma

# Context

def word_count(span: Span, profile: LanguageProfile) -> int:
    if profile.spaced:
        return len(span.text.split())
    return sum(1 for t in span if not t.is_punct and not t.is_space)

def span_text(span: Span, profile: LanguageProfile) -> str:
    joiner = " " if profile.spaced else ""
    return joiner.join(source_text(span).split())

def context_of(token: Token, profile: LanguageProfile = SPANISH) -> str:
    doc = token.doc
    sentence = token.sent

    if word_count(sentence, profile) <= MAX_CONTEXT_WORDS:
        return span_text(sentence, profile)

    start, end = sentence.start, sentence.end
    for i in range(token.i, sentence.start - 1, -1):
        if doc[i].text in BREAKS:
            start = i + 1
            break
    for i in range(token.i, sentence.end):
        if doc[i].text in BREAKS:
            end = i
            break

    clause = doc[start:end]
    if MIN_CONTEXT_WORDS <= word_count(clause, profile) <= MAX_CONTEXT_WORDS:
        return span_text(clause, profile)
    return window_around(token, profile)

def window_around(token: Token, profile: LanguageProfile = SPANISH) -> str:
    doc = token.doc
    sentence = token.sent
    end = min(sentence.end, max(token.i - MAX_CONTEXT_WORDS // 2, sentence.start) + MAX_CONTEXT_WORDS)
    start = max(sentence.start, end - MAX_CONTEXT_WORDS)
    if not profile.spaced:
        window = doc[start:end]
        return span_text(window, profile) if word_count(window, profile) >= MIN_CONTEXT_WORDS else ""
    words = doc[start:end].text.split()[:MAX_CONTEXT_WORDS]
    if len(words) < MIN_CONTEXT_WORDS:
        return ""
    return " ".join(words)

# Foreign words

def looks_foreign(lemma: str, zipf: float, profile: LanguageProfile) -> bool:
    if profile.foreign_lang is None:
        return False
    return zipf_frequency(lemma, profile.foreign_lang) - zipf >= FOREIGN_MARGIN

def foreign_sentences(doc: Doc, profile: LanguageProfile) -> set[int]:
    starts: set[int] = set()
    for sentence in doc.sents:
        words = [t.lower_ for t in sentence if t.is_alpha]
        if len(words) < MIN_SENTENCE_WORDS:
            continue
        foreign = sum(
            1
            for w in words
            if not in_script(w, profile.script) or looks_foreign(w, zipf_frequency(w, profile.code), profile)
        )
        if foreign / len(words) >= FOREIGN_SENTENCE_SHARE:
            starts.add(sentence.start)
    return starts

# Extraction

def candidates_from_text(text: str, lang: str = "es") -> list[Candidate]:
    profile = profile_for(lang)
    if profile.pipeline == "hazm":
        from curator.nlp import persian

        return persian.candidates_from_text(text, profile)
    doc = parse(text, profile)

    foreign = foreign_sentences(doc, profile)
    grouped: dict[str, list[Token]] = defaultdict(list)
    for token in doc:
        if token.sent.start in foreign or not is_candidate(token, profile):
            continue
        grouped[lemma_of(token, profile)].append(token)

    candidates: list[Candidate] = []
    for lemma, tokens in grouped.items():
        pos = Counter(t.pos_ for t in tokens).most_common(1)[0][0]
        first = next(t for t in tokens if t.pos_ == pos)
        zipf = zipf_frequency(frequency_base(lemma, first.pos_, profile), profile.code)
        phrase = " " in lemma
        if zipf < profile.min_zipf or (zipf > profile.max_zipf and not phrase):
            continue
        if looks_foreign(lemma, zipf, profile):
            continue

        context = next((c for c in (context_of(t, profile) for t in tokens) if c), "")
        candidates.append(
            Candidate(
                lemma=lemma,
                surface=source_text(first),
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

def order_by_frequency(candidates: list[Candidate]) -> list[Candidate]:
    return sorted(candidates, key=lambda c: (-c.zipf, -salience(c)))
