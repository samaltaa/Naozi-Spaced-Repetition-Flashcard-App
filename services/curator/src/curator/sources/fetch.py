from __future__ import annotations

from pathlib import Path

import trafilatura
from lxml import html
from lxml.etree import ParserError

# Limits

MAX_CHARS = 120_000

# Joiners

JOINERS = {"\u200c": "QZWNJQ", "\u200d": "QZWJQ"}

def protect_joiners(text: str) -> str:
    for char, mark in JOINERS.items():
        text = text.replace(char, mark)
    return text

def restore_joiners(text: str) -> str:
    for char, mark in JOINERS.items():
        text = text.replace(mark, char)
    return text

# End matter

END_MATTER = " | ".join(
    [
        "//ol[contains(@class, 'references')]",
        "//div[contains(@class, 'reflist')]",
        "//div[contains(@class, 'refbegin')]",
        "//div[contains(@class, 'mw-references-wrap')]",
        "//sup[contains(@class, 'reference')]",
        "//span[contains(@class, 'mw-editsection')]",
        "//*[contains(@class, 'navbox')]",
        "//li[.//a[contains(@class, 'external')]]",
    ]
)

def strip_end_matter(page: str) -> str:
    try:
        tree = html.fromstring(page)
    except ParserError:
        return page
    found = tree.xpath(END_MATTER)
    for element in found if isinstance(found, list) else []:
        if isinstance(element, html.HtmlElement) and element.getparent() is not None:
            element.drop_tree()
    return html.tostring(tree, encoding="unicode")

# Fetching

def extract_text(page: str) -> str | None:
    text = trafilatura.extract(
        strip_end_matter(protect_joiners(page)),
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    )
    return restore_joiners(text) if text else None

def from_url(url: str) -> str:
    downloaded = trafilatura.fetch_url(url)
    if downloaded is None:
        raise RuntimeError(f"Could not download {url}")

    text = extract_text(downloaded)
    if not text:
        raise RuntimeError(f"No article text found at {url}")

    return clean(text)

def from_file(path: str | Path) -> str:
    return clean(Path(path).read_text(encoding="utf-8"))

def clean(text: str) -> str:
    lines = [" ".join(line.split()) for line in text.splitlines()]
    kept = [line for line in lines if line]
    joined = "\n".join(kept)
    return joined[:MAX_CHARS]
