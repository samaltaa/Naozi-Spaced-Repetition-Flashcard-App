from __future__ import annotations

from pathlib import Path

import trafilatura

# Limits

MAX_CHARS = 40_000

# Fetching

def from_url(url: str) -> str:
    downloaded = trafilatura.fetch_url(url)
    if downloaded is None:
        raise RuntimeError(f"Could not download {url}")

    text = trafilatura.extract(
        downloaded,
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