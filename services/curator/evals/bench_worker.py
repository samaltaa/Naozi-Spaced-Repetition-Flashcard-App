from __future__ import annotations

import inspect
import json
import sys
import time
from pathlib import Path
from typing import Any

# Pricing

PRICES = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-haiku-4-5": (1.0, 5.0),
}

LANGUAGE_NAMES = {"es": "Spanish", "ru": "Russian", "zh": "Chinese"}

def cost(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICES[model]
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000

# Batches

def batches_of(result: Any, default_model: str) -> list[dict[str, Any]]:
    found = getattr(result, "batches", None)
    if found:
        return [
            {
                "model": getattr(b, "model", "") or default_model,
                "purpose": getattr(b, "purpose", "translate"),
                "input_tokens": b.input_tokens,
                "output_tokens": b.output_tokens,
                "failed_models": list(getattr(b, "failed_models", [])),
            }
            for b in found
        ]
    if result.input_tokens or result.output_tokens:
        return [
            {
                "model": default_model,
                "purpose": "translate",
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "failed_models": [],
            }
        ]
    return []

# Warm-up

def warm_up(candidates_from_text: Any, text: str, lang: str) -> None:
    sample = text[:300]
    if "lang" in inspect.signature(candidates_from_text).parameters:
        candidates_from_text(sample, lang=lang)
    else:
        candidates_from_text(sample)

# Run

def main() -> None:
    text_path, lang = Path(sys.argv[1]), sys.argv[2]

    from curator import extract
    from curator.config import get_settings, prompt_version
    from curator.extract import extract_from_text

    text = text_path.read_text(encoding="utf-8")
    settings = get_settings()
    warm_up(extract.candidates_from_text, text, lang)

    started = time.perf_counter()
    result = extract_from_text(text, target_language=LANGUAGE_NAMES[lang], source_language="English", lang=lang)
    seconds = time.perf_counter() - started

    batches = batches_of(result, settings.extraction_model)
    payload = {
        "curator_path": extract.__file__,
        "prompt_version": prompt_version("extract_items"),
        "model": settings.extraction_model,
        "seconds": round(seconds, 2),
        "batches": batches,
        "input_tokens": sum(b["input_tokens"] for b in batches),
        "output_tokens": sum(b["output_tokens"] for b in batches),
        "cost_usd": round(sum(cost(b["model"], b["input_tokens"], b["output_tokens"]) for b in batches), 6),
        "failed_batches": getattr(result, "failed_batches", 0),
        "items": [
            {
                "lemma": item.lemma,
                "answer": item.answer,
                "prompt": item.prompt,
                "alternates": list(item.alternates),
                "pos": item.pos,
                "reading": getattr(item, "reading", None),
                "context": item.context,
            }
            for item in result.items
        ],
        "skipped": [{"lemma": s.lemma, "reason": s.reason} for s in result.skipped],
        "rejected": [{"lemma": r.lemma, "reason": r.reason} for r in result.rejected],
    }
    print(json.dumps(payload, ensure_ascii=False))

if __name__ == "__main__":
    main()
