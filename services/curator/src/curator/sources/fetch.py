from __future__ import annotations

from pathlib import Path

import trafilatura
from lxml import html
from lxml.etree import ParserError

# Limits

MAX_CHARS = 40_000

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

def from_url(url: str) -> str:
    downloaded = trafilatura.fetch_url(url)
    if downloaded is None:
        raise RuntimeError(f"Could not download {url}")

    text = trafilatura.extract(
        strip_end_matter(downloaded),
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    )
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
