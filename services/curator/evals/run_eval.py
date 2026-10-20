from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from curator.config import get_settings, prompt_version
from curator.extract import extract_from_text
from curator.schema import fold
from curator.sources import fetch

# Paths

EVALS = Path(__file__).resolve().parent
TEXTS = EVALS / "datasets" / "texts"
EXPECTED = EVALS / "datasets" / "expected"
RESULTS = EVALS / "results"
SUFFIX = ".draft.yaml"

# Matching

def normalize_prompt(text: str) -> str:
    cleaned = text.split("(")[0]
    cleaned = cleaned.replace("to ", " ").replace("the ", " ")
    return fold(cleaned).strip(" ,.;")

def prompt_matches(produced: str, accepted: list[str]) -> bool:
    produced_parts = {normalize_prompt(part) for part in produced.split(",")}
    accepted_parts = {normalize_prompt(part) for part in accepted}
    return bool(produced_parts & accepted_parts)

# Expectations

@dataclass
class Expectation:
    answer: str
    prompt: list[str] = field(default_factory=list)

@dataclass
class GoldenEntry:
    name: str
    language: str
    notes: str
    required: list[Expectation]
    optional: list[Expectation]
    forbidden: list[str]

def load_entry(path: Path) -> GoldenEntry | None:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not raw:
        print(f"  {path.name} is empty, skipping")
        return None

    def entries(key: str) -> list[Expectation]:
        return [
            Expectation(answer=row["answer"], prompt=list(row.get("prompt") or []))
            for row in (raw.get(key) or [])
        ]

    entry = GoldenEntry(
        name=raw.get("name", path.name.removesuffix(SUFFIX)),
        language=raw.get("language", "es"),
        notes=raw.get("notes", ""),
        required=entries("required"),
        optional=entries("optional"),
        forbidden=[str(value) for value in (raw.get("forbidden") or [])],
    )

    if not entry.required:
        print(f"  {path.name} has no required items, recall will be meaningless")

    return entry

# Scoring

@dataclass
class TextReport:
    name: str
    required_total: int = 0
    required_found: int = 0
    required_missed: list[str] = field(default_factory=list)
    optional_found: int = 0
    unlisted: list[str] = field(default_factory=list)
    violations: list[str] = field(default_factory=list)
    correct_refusals: list[str] = field(default_factory=list)
    translation_checked: int = 0
    translation_ok: int = 0
    translation_bad: list[str] = field(default_factory=list)
    produced: int = 0
    skipped: int = 0
    rejected: int = 0
    rejections: list[str] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def recall(self) -> float:
        return self.required_found / self.required_total if self.required_total else 0.0

    @property
    def judged(self) -> int:
        return self.required_found + self.optional_found + len(self.violations)

    @property
    def precision(self) -> float:
        judged = self.judged
        return (self.required_found + self.optional_found) / judged if judged else 0.0

    @property
    def translation_accuracy(self) -> float:
        return self.translation_ok / self.translation_checked if self.translation_checked else 0.0

def score(entry: GoldenEntry, text: str) -> TextReport:
    report = TextReport(name=entry.name)
    result = extract_from_text(text, lang=entry.language)

    report.produced = len(result.items)
    report.skipped = len(result.skipped)
    report.rejected = len(result.rejected)
    report.rejections = [f"{r.lemma}: {r.reason}" for r in result.rejected]
    report.input_tokens = result.input_tokens
    report.output_tokens = result.output_tokens

    produced = {fold(item.answer): item for item in result.items}
    skipped = {fold(item.lemma) for item in result.skipped}
    forbidden = {fold(word) for word in entry.forbidden}

    matched: set[str] = set()

    report.required_total = len(entry.required)
    for expected in entry.required:
        key = fold(expected.answer)
        item = produced.get(key)
        if item is None:
            report.required_missed.append(expected.answer)
            continue
        matched.add(key)
        report.required_found += 1
        if expected.prompt:
            report.translation_checked += 1
            if prompt_matches(item.prompt, expected.prompt):
                report.translation_ok += 1
            else:
                report.translation_bad.append(f"{expected.answer}: got '{item.prompt}'")

    for expected in entry.optional:
        key = fold(expected.answer)
        if key in produced:
            matched.add(key)
            report.optional_found += 1

    for key, item in produced.items():
        if key in matched:
            continue
        if any(word == key or word in key.split() for word in forbidden):
            report.violations.append(item.answer)
        else:
            report.unlisted.append(item.answer)

    for word in forbidden:
        if word in skipped:
            report.correct_refusals.append(word)

    return report

# Reporting

def summarize(reports: list[TextReport]) -> dict:
    required_total = sum(r.required_total for r in reports)
    required_found = sum(r.required_found for r in reports)
    judged = sum(r.judged for r in reports)
    correct = sum(r.required_found + r.optional_found for r in reports)
    checked = sum(r.translation_checked for r in reports)
    ok = sum(r.translation_ok for r in reports)

    return {
        "texts": len(reports),
        "recall": round(required_found / required_total, 3) if required_total else 0.0,
        "precision": round(correct / judged, 3) if judged else 0.0,
        "translation_accuracy": round(ok / checked, 3) if checked else 0.0,
        "violations": sum(len(r.violations) for r in reports),
        "correct_refusals": sum(len(r.correct_refusals) for r in reports),
        "produced": sum(r.produced for r in reports),
        "unlisted": sum(len(r.unlisted) for r in reports),
        "skipped": sum(r.skipped for r in reports),
        "rejected": sum(r.rejected for r in reports),
        "input_tokens": sum(r.input_tokens for r in reports),
        "output_tokens": sum(r.output_tokens for r in reports),
    }

def print_reports(reports: list[TextReport], totals: dict) -> None:
    print(f"\n{'text':<16} {'recall':>7} {'prec':>7} {'trans':>7} {'items':>6} {'viol':>5} {'rej':>4}")
    print("-" * 60)
    for report in reports:
        print(
            f"{report.name:<16} {report.recall:>7.2f} {report.precision:>7.2f} "
            f"{report.translation_accuracy:>7.2f} {report.produced:>6} "
            f"{len(report.violations):>5} {report.rejected:>4}"
        )

    print("-" * 60)
    print(
        f"{'TOTAL':<16} {totals['recall']:>7.2f} {totals['precision']:>7.2f} "
        f"{totals['translation_accuracy']:>7.2f} {totals['produced']:>6} "
        f"{totals['violations']:>5} {totals['rejected']:>4}"
    )

    print("\nFailures")
    for report in reports:
        problems = []
        if report.required_missed:
            problems.append(f"  missed: {', '.join(report.required_missed)}")
        if report.violations:
            problems.append(f"  forbidden: {', '.join(report.violations)}")
        if report.translation_bad:
            problems.extend(f"  translation: {line}" for line in report.translation_bad)
        if report.rejections:
            problems.extend(f"  rejected: {line}" for line in report.rejections)
        if problems:
            print(f"\n{report.name}")
            print("\n".join(problems))

# Entry point

def main() -> None:
    settings = get_settings()
    stems = sys.argv[1:] or sorted(p.name.removesuffix(SUFFIX) for p in EXPECTED.glob(f"*{SUFFIX}"))

    reports: list[TextReport] = []
    for stem in stems:
        text_path = TEXTS / f"{stem}.txt"
        expected_path = EXPECTED / f"{stem}{SUFFIX}"
        if not text_path.exists() or not expected_path.exists():
            print(f"skipping {stem}: missing text or expectations")
            continue

        entry = load_entry(expected_path)
        if entry is None:
            continue

        text = fetch.from_file(text_path)
        print(f"running {stem}...")
        reports.append(score(entry, text))

    if not reports:
        print("nothing to evaluate")
        return

    totals = summarize(reports)
    print_reports(reports, totals)

    RESULTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    payload = {
        "timestamp": stamp,
        "model": settings.extraction_model,
        "prompt_version": prompt_version("extract_items"),
        "settings": {
            "batch_size": settings.batch_size,
            "max_items_per_text": settings.max_items_per_text,
        },
        "totals": totals,
        "texts": [asdict(report) for report in reports],
    }
    out = RESULTS / f"{stamp}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nsaved {out.relative_to(EVALS)}")

if __name__ == "__main__":
    main()