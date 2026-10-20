from __future__ import annotations

import functools
from dataclasses import dataclass, field
from typing import Literal

import spacy.util

# Shared text

GENERIC_FORM_RULES = """\
- Nouns: the singular dictionary form, with its definite article if learners of the language usually memorize nouns with one.
- Verbs: the dictionary form.
- Adjectives: the dictionary form."""

LEADING_ARTICLES: dict[str, tuple[str, ...]] = {
    "es": ("el", "la", "los", "las", "lo", "un", "una", "unos", "unas"),
    "en": ("the", "a", "an"),
    "pt": ("o", "a", "os", "as", "um", "uma"),
    "it": ("il", "lo", "la", "i", "gli", "le", "un", "uno", "una"),
    "fr": ("le", "la", "les", "un", "une"),
    "ca": ("el", "la", "els", "les", "un", "una"),
    "de": ("der", "die", "das", "ein", "eine"),
}

# Profile

ReadingKind = Literal["stress", "pinyin"]

@dataclass(frozen=True)
class LanguageProfile:
    code: str
    spacy_model: str
    script: str | None = None
    foreign_lang: str | None = None
    verb_endings: tuple[str, ...] = ()
    reflexive_pronouns: frozenset[str] = frozenset()
    reflexive_suffix: str = ""
    noun_articles: dict[str, str] = field(default_factory=dict)
    leading_articles: tuple[str, ...] = ()
    phrasal_verbs: bool = False
    reading: ReadingKind | None = None
    vowels: str = ""
    spaced: bool = True
    parse_simplified: bool = False
    min_length: int = 3
    min_zipf: float = 2.0
    max_zipf: float = 5.5
    form_rules: str = GENERIC_FORM_RULES

# Profiles

SPANISH = LanguageProfile(
    code="es",
    spacy_model="es_core_news_md",
    script="LATIN",
    foreign_lang="en",
    verb_endings=("ar", "er", "ir", "ár", "ér", "ír"),
    reflexive_pronouns=frozenset({"se"}),
    reflexive_suffix="se",
    noun_articles={"masculine": "el", "feminine": "la"},
    leading_articles=LEADING_ARTICLES["es"],
    form_rules="""\
- Nouns: the definite article and singular. "el agua", "el problema", "la mano".
- Verbs: the infinitive. Keep the reflexive pronoun only when it changes the meaning, as in "darse cuenta" or "irse". When the suggested form adds one that does not, send the plain infinitive: "requerir" for "requerirse".
- Adjectives: masculine singular.""",
)

ENGLISH = LanguageProfile(
    code="en",
    spacy_model="en_core_web_md",
    script="LATIN",
    leading_articles=LEADING_ARTICLES["en"],
    phrasal_verbs=True,
    form_rules="""\
- Nouns: singular, without an article. "house", "child".
- Verbs: the bare infinitive, without "to". Keep the particle of a phrasal verb: "give up", "look after".
- Adjectives: the base form, not comparative or superlative.""",
)

RUSSIAN = LanguageProfile(
    code="ru",
    spacy_model="ru_core_news_md",
    script="CYRILLIC",
    verb_endings=("ть", "ти", "чь", "ться", "тись", "чься"),
    reading="stress",
    vowels="аеёиоуыэюя",
    form_rules="""\
- Nouns: nominative singular. Use the plural only for nouns that have no singular: "ножницы".
- Verbs: the infinitive, in the aspect it appeared in. Keep "-ся" when the verb has it.
- Adjectives: masculine nominative singular.""",
)

CHINESE = LanguageProfile(
    code="zh",
    spacy_model="zh_core_web_md",
    script="CJK",
    reading="pinyin",
    spaced=False,
    parse_simplified=True,
    min_length=1,
    max_zipf=6.0,
    form_rules="""\
- Keep the characters the text uses, simplified or traditional. Never send pinyin in `form`.
- Nouns: the word alone, without a measure word. "书", not "一本书".
- Verbs and adjectives: the word alone, without 了, 过, 着 or 的.
- The part of speech comes from an automatic tagger and is often wrong for Chinese. Gloss the word's most common meaning whatever the tag says: 引入 is "to introduce", not "introduction". Never skip a word because its part of speech is wrong.""",
)

PROFILES = {profile.code: profile for profile in (SPANISH, ENGLISH, RUSSIAN, CHINESE)}

GENERIC_MODELS = ("{code}_core_news_md", "{code}_core_web_md", "{code}_core_news_sm", "{code}_core_web_sm")

# Lookup

class UnsupportedLanguage(ValueError):
    pass

def base_code(lang: str) -> str:
    return lang.lower().split("-")[0]

def installed(model: str) -> bool:
    return spacy.util.is_package(model)

@functools.lru_cache(maxsize=32)
def find_profile(lang: str) -> LanguageProfile | None:
    code = base_code(lang)
    profile = PROFILES.get(code)
    if profile is not None:
        return profile if installed(profile.spacy_model) else None
    for template in GENERIC_MODELS:
        model = template.format(code=code)
        if installed(model):
            return LanguageProfile(
                code=code,
                spacy_model=model,
                leading_articles=LEADING_ARTICLES.get(code, ()),
            )
    return None

def profile_for(lang: str) -> LanguageProfile:
    profile = find_profile(lang)
    if profile is None:
        raise UnsupportedLanguage(f"Articles in '{base_code(lang)}' are not supported yet")
    return profile
