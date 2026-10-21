from __future__ import annotations

import functools
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

from wordfreq import zipf_frequency

from curator.config import get_settings
from curator.languages import LanguageProfile
from curator.nlp.tokenize import (
    FOREIGN_SENTENCE_SHARE,
    MAX_CONTEXT_WORDS,
    MIN_CONTEXT_WORDS,
    MIN_SENTENCE_WORDS,
    in_script,
)
from curator.schema import Candidate, PartOfSpeech

# Configuration

TAGGER_REPO = "roshan-research/hazm-postagger"
TAGGER_FILE = "pos_tagger.model"

KEEP_POS: dict[str, PartOfSpeech] = {
    "NOUN": "noun",
    "VERB": "verb",
    "ADJ": "adjective",
    "ADV": "adverb",
}

ZWNJ = "‌"
VERB_JOINER = "_"
INFINITIVE_ENDING = "ن"

# Tools

@dataclass(frozen=True)
class Tools:
    normalizer: Any
    sentences: Any
    words: Any
    tagger: Any
    lemmatizer: Any
    stopwords: frozenset[str]

@functools.lru_cache(maxsize=1)
def tools() -> Tools:
    import hazm  # type: ignore[import-untyped]

    path = get_settings().hazm_tagger_model
    tagger = (
        hazm.POSTagger(model=path, universal_tag=True)
        if path
        else hazm.POSTagger(repo_id=TAGGER_REPO, model_filename=TAGGER_FILE, universal_tag=True)
    )
    return Tools(
        normalizer=hazm.Normalizer(),
        sentences=hazm.SentenceTokenizer(),
        words=hazm.WordTokenizer(),
        tagger=tagger,
        lemmatizer=hazm.Lemmatizer(),
        stopwords=frozenset(hazm.stopwords_list()),
    )

def normalize(text: str) -> str:
    return str(tools().normalizer.normalize(text))

# Tokens

@dataclass(frozen=True)
class Token:
    surface: str
    tag: str
    lemma: str
    sentence: int
    position: int

def surface_text(word: str) -> str:
    return word.replace(VERB_JOINER, " ")

def is_word(text: str) -> bool:
    return bool(text) and all(ch.isalpha() or ch == ZWNJ for ch in text)

def lemma_of(word: str, tag: str) -> str:
    lemmatizer = tools().lemmatizer
    if tag == "VERB":
        lemma = str(lemmatizer.lemmatize(word, pos="VERB"))
        if "#" in lemma:
            past = lemma.split("#")[0]
            return f"{past}{INFINITIVE_ENDING}" if past else ""
        return lemma
    return str(lemmatizer.lemmatize(word))

@dataclass(frozen=True)
class Sentence:
    text: str
    words: list[str]

def tokens_of(text: str) -> tuple[list[Token], list[Sentence]]:
    kit = tools()
    sentences = [Sentence(text=" ".join(s.split()), words=kit.words.tokenize(s)) for s in kit.sentences.tokenize(normalize(text))]
    tokens: list[Token] = []
    for index, tagged in enumerate(kit.tagger.tag_sents([s.words for s in sentences])):
        for position, (word, tag) in enumerate(tagged):
            tokens.append(Token(surface=word, tag=tag, lemma=lemma_of(word, tag), sentence=index, position=position))
    return tokens, sentences

# Filters

def is_candidate(token: Token, profile: LanguageProfile) -> bool:
    if token.tag not in KEEP_POS:
        return False
    stopwords = tools().stopwords
    if token.surface in stopwords or token.lemma in stopwords:
        return False
    if not is_word(token.lemma) or len(token.lemma.replace(ZWNJ, "")) < profile.min_length:
        return False
    if not in_script(token.lemma, profile.script):
        return False
    return not (token.tag == "VERB" and not token.lemma.endswith(profile.verb_endings))

def foreign_sentences(sentences: list[Sentence], profile: LanguageProfile) -> set[int]:
    foreign: set[int] = set()
    for index, sentence in enumerate(sentences):
        letters = [w for w in sentence.words if any(ch.isalpha() for ch in w)]
        if len(letters) < MIN_SENTENCE_WORDS:
            continue
        outside = sum(1 for w in letters if not in_script(w, profile.script))
        if outside / len(letters) >= FOREIGN_SENTENCE_SHARE:
            foreign.add(index)
    return foreign

# Context

def context_of(token: Token, sentences: list[Sentence]) -> str:
    sentence = sentences[token.sentence]
    words = [surface_text(w) for w in sentence.words]
    if len(words) <= MAX_CONTEXT_WORDS:
        return sentence.text if len(words) >= MIN_CONTEXT_WORDS else ""
    start = max(0, min(token.position - MAX_CONTEXT_WORDS // 2, len(words) - MAX_CONTEXT_WORDS))
    return " ".join(words[start : start + MAX_CONTEXT_WORDS])

# Extraction

def candidates_from_text(text: str, profile: LanguageProfile) -> list[Candidate]:
    tokens, sentences = tokens_of(text)
    foreign = foreign_sentences(sentences, profile)

    grouped: dict[str, list[Token]] = defaultdict(list)
    for token in tokens:
        if token.sentence in foreign or not is_candidate(token, profile):
            continue
        grouped[token.lemma].append(token)

    candidates: list[Candidate] = []
    for lemma, found in grouped.items():
        tag = Counter(t.tag for t in found).most_common(1)[0][0]
        first = next(t for t in found if t.tag == tag)
        zipf = zipf_frequency(lemma, profile.code)
        if zipf < profile.min_zipf or zipf > profile.max_zipf:
            continue
        context = next((c for c in (context_of(t, sentences) for t in found) if c), "")
        candidates.append(
            Candidate(
                lemma=lemma,
                surface=surface_text(first.surface),
                pos=KEEP_POS[tag],
                zipf=zipf,
                context=context,
                occurrences=len(found),
            )
        )
    return candidates
