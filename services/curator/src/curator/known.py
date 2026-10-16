from __future__ import annotations

from collections.abc import Iterable

from curator.languages import LEADING_ARTICLES, base_code
from curator.schema import ExtractedItem, fold

# Leading articles

ELIDED = ("l'", "l’")

# Term keys

def term_key(term: str, lang: str) -> str:
    key = fold(term)
    for prefix in ELIDED:
        if key.startswith(prefix):
            return key[len(prefix) :].strip()
    head, _, rest = key.partition(" ")
    if rest and head in LEADING_ARTICLES.get(base_code(lang), ()):
        return rest
    return key

def known_keys(terms: Iterable[str], lang: str) -> set[str]:
    return {term_key(term, lang) for term in terms if term.strip()}

def is_known(item: ExtractedItem, known: set[str], lang: str) -> bool:
    return term_key(item.lemma, lang) in known or term_key(item.answer, lang) in known

def drop_known(
    items: list[ExtractedItem], known: set[str], lang: str
) -> tuple[list[ExtractedItem], list[ExtractedItem]]:
    fresh: list[ExtractedItem] = []
    dropped: list[ExtractedItem] = []
    for item in items:
        (dropped if is_known(item, known, lang) else fresh).append(item)
    return fresh, dropped
