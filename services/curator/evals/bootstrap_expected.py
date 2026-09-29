from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from curator.extract import extract_from_text
from curator.sources import fetch

# Paths

EVALS = Path(__file__).resolve().parent
TEXTS = EVALS / "datasets" / "texts"
EXPECTED = EVALS / "datasets" / "expected"

# Generation

def bootstrap(stem: str) -> None:
    text_path = TEXTS / f"{stem}.txt"
    out_path = EXPECTED / f"{stem}.draft.yaml"

    text = fetch.from_file(text_path)
    result = extract_from_text(text)

    document = {
        "name": stem,
        "language": "es",
        "notes": "",
        "required": [],
        "optional": [
            {"answer": item.answer, "prompt": [item.prompt]} for item in result.items
        ],
        "forbidden": [],
    }

    out_path.write_text(
        yaml.safe_dump(document, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"{stem}: {len(result.items)} items, {len(result.skipped)} skipped → {out_path.name}")

def main() -> None:
    stems = sys.argv[1:]
    if not stems:
        stems = sorted(p.stem for p in TEXTS.glob("*.txt") if p.stat().st_size > 0)
    for stem in stems:
        bootstrap(stem)

if __name__ == "__main__":
    main()