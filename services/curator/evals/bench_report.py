from __future__ import annotations

import html
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from curator.known import term_key
from curator.nlp.tokenize import to_simplified

from bench_judge import GENERATIONS, JUDGMENTS, LEDGER, grade_key

# Paths

EVALS = Path(__file__).resolve().parent
DATASET = EVALS / "datasets" / "benchmark"
OUTPUT = EVALS / "results" / "evaluation_results.html"

# Labels

VERSIONS = ["v1", "v3", "v4", "v6"]
LANGS = ["es", "ru", "zh"]
LANG_NAMES = {"es": "Spanish", "ru": "Russian", "zh": "Chinese"}
VERSION_NOTES = {
    "v1": "Sonnet 4.6 · full replies",
    "v3": "Sonnet 4.6 · slim replies",
    "v4": "Haiku 5.5 · fallback",
    "v6": "Haiku 5.5 · language profiles",
}
VERSION_COLORS = {"v1": "#c2410c", "v3": "#ea580c", "v4": "#15803d", "v6": "#0f766e"}
LANG_COLORS = {"es": "#0f766e", "ru": "#7c3aed", "zh": "#b91c1c"}
OUTCOME_COLORS = {
    "usable": "#15803d",
    "reading": "#a855f7",
    "gloss": "#f59e0b",
    "form": "#fb923c",
    "invalid": "#9ca3af",
}
OUTCOME_LABELS = {
    "usable": "Usable card",
    "reading": "Wrong reading only",
    "gloss": "Wrong gloss",
    "form": "Wrong form",
    "invalid": "Not a valid word",
}

# Metrics

@dataclass
class RunMetrics:
    version: str
    text: str
    language: str
    kind: str
    run: int
    produced: int = 0
    graded: int = 0
    valid: int = 0
    precise: int = 0
    gloss_ok: int = 0
    usable: int = 0
    reading_checked: int = 0
    reading_ok: int = 0
    cost: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    rejected: int = 0
    outcomes: Counter[str] = field(default_factory=Counter)
    answers: set[str] = field(default_factory=set)
    issues: list[tuple[str, str]] = field(default_factory=list)

    @property
    def precision(self) -> float:
        return self.precise / self.graded if self.graded else 0.0

    @property
    def usable_rate(self) -> float:
        return self.usable / self.graded if self.graded else 0.0

    @property
    def gloss_accuracy(self) -> float:
        return self.gloss_ok / self.valid if self.valid else 0.0

    @property
    def reading_accuracy(self) -> float | None:
        return self.reading_ok / self.reading_checked if self.reading_checked else None

    @property
    def cost_per_usable(self) -> float | None:
        return self.cost / self.usable if self.usable else None

def match_key(term: str, lang: str) -> str:
    key = term_key(term, lang)
    return to_simplified(key) if lang == "zh" else key

def outcome(grade: dict[str, Any]) -> str:
    if not grade["valid"]:
        return "invalid"
    if not grade["form_ok"]:
        return "form"
    if not grade["gloss_ok"]:
        return "gloss"
    if grade.get("reading_ok") is False:
        return "reading"
    return "usable"

def measure(run: dict[str, Any], judgments: dict[str, Any], kinds: dict[str, str]) -> RunMetrics:
    lang = run["language"]
    m = RunMetrics(run["version"], run["text"], lang, kinds[run["text"]], run["run"])
    m.produced = len(run["items"])
    m.cost = run["cost_usd"]
    m.input_tokens = run["input_tokens"]
    m.output_tokens = run["output_tokens"]
    m.seconds = run["seconds"]
    m.rejected = len(run["rejected"])

    for item in run["items"]:
        m.answers.add(match_key(item["answer"], lang))

        grade = judgments.get(grade_key(lang, item))
        if grade is None:
            continue
        m.graded += 1
        result = outcome(grade)
        m.outcomes[result] += 1
        m.valid += grade["valid"]
        m.precise += grade["valid"] and grade["form_ok"]
        m.gloss_ok += grade["valid"] and grade["gloss_ok"]
        m.usable += result == "usable"
        if grade.get("reading_ok") is not None and grade["valid"]:
            m.reading_checked += 1
            m.reading_ok += bool(grade["reading_ok"])
        if result != "usable" and grade.get("issue"):
            m.issues.append((f"{item['answer']} = {item['prompt']}", grade["issue"]))
    return m

def load_runs() -> list[RunMetrics]:
    judgments = json.loads(JUDGMENTS.read_text(encoding="utf-8")) if JUDGMENTS.exists() else {}
    sources = yaml.safe_load((DATASET / "sources.yaml").read_text(encoding="utf-8"))["texts"]
    kinds = {s["name"]: s["kind"] for s in sources}
    runs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(GENERATIONS.glob("*.json"))]
    return [measure(run, judgments, kinds) for run in runs]

# Aggregation

def pooled(runs: list[RunMetrics], numerator: str, denominator: str) -> float:
    top = sum(getattr(r, numerator) for r in runs)
    bottom = sum(getattr(r, denominator) for r in runs)
    return top / bottom if bottom else 0.0

def median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0

@dataclass
class Summary:
    runs: list[RunMetrics]

    @property
    def precision(self) -> float:
        return pooled(self.runs, "precise", "graded")

    @property
    def usable_rate(self) -> float:
        return pooled(self.runs, "usable", "graded")

    @property
    def gloss_accuracy(self) -> float:
        return pooled(self.runs, "gloss_ok", "valid")

    @property
    def reading_accuracy(self) -> float | None:
        checked = sum(r.reading_checked for r in self.runs)
        return sum(r.reading_ok for r in self.runs) / checked if checked else None

    @property
    def cost(self) -> float:
        return median([r.cost for r in self.runs])

    @property
    def cost_range(self) -> tuple[float, float]:
        costs = [r.cost for r in self.runs]
        return (min(costs), max(costs)) if costs else (0.0, 0.0)

    @property
    def cost_per_usable(self) -> float:
        usable = sum(r.usable for r in self.runs)
        return sum(r.cost for r in self.runs) / usable if usable else 0.0

    @property
    def tokens(self) -> tuple[float, float]:
        return median([r.input_tokens for r in self.runs]), median([r.output_tokens for r in self.runs])

    @property
    def seconds(self) -> float:
        return median([r.seconds for r in self.runs])

    @property
    def produced(self) -> float:
        return median([r.produced for r in self.runs])

    @property
    def outcomes(self) -> Counter[str]:
        total: Counter[str] = Counter()
        for r in self.runs:
            total.update(r.outcomes)
        return total

def summarize(runs: list[RunMetrics]) -> dict[tuple[str, str], Summary]:
    grouped: dict[tuple[str, str], list[RunMetrics]] = defaultdict(list)
    for r in runs:
        grouped[(r.version, r.language)].append(r)
    return {key: Summary(value) for key, value in grouped.items()}

# Formatting

def esc(text: object) -> str:
    return html.escape(str(text))

def pct(value: float | None, digits: int = 0) -> str:
    return "–" if value is None else f"{value * 100:.{digits}f}%"

def usd(value: float) -> str:
    if value == 0:
        return "$0"
    if value >= 1:
        return f"${value:,.2f}"
    if value >= 0.01:
        return f"${value:.3f}"
    if value >= 0.001:
        return f"${value:.4f}"
    return f"${value:.5f}"

def change(before: float, after: float) -> str:
    if not before:
        return "–"
    delta = (after - before) / before
    sign = "+" if delta > 0 else "−"
    return f"{sign}{abs(delta) * 100:.1f}%"

def points(before: float, after: float) -> str:
    delta = (after - before) * 100
    sign = "+" if delta >= 0 else "−"
    return f"{sign}{abs(delta):.1f} pts"

# Charts

@dataclass
class Bar:
    value: float
    color: str
    label: str
    segments: list[tuple[float, str]] | None = None

@dataclass
class Column:
    title: str
    caption: str
    bars: list[Bar]

def ticks_html(ticks: list[tuple[float, str]]) -> str:
    return "".join(f'<span style="bottom:{position * 100:.2f}%">{esc(text)}</span>' for position, text in ticks)

def column_chart(
    columns: list[Column],
    scale: Any,
    ticks: list[tuple[float, str]],
    height: int = 260,
    legend: list[tuple[str, str]] | None = None,
) -> str:
    groups = []
    for column in columns:
        bars = []
        for bar in column.bars:
            h = max(0.0, min(1.0, scale(bar.value))) * 100
            if bar.segments:
                total = sum(v for v, _ in bar.segments) or 1
                segs = "".join(
                    f'<div class="seg" style="height:{v / total * 100:.2f}%; background:{c}"></div>' for v, c in bar.segments
                )
                bars.append(f'<div class="bar stack" style="--h:{h:.2f}%"><span class="val">{esc(bar.label)}</span>{segs}</div>')
            elif bar.value == 0:
                bars.append(f'<div class="bar zero" style="--c:{bar.color}"><span class="val">{esc(bar.label)}</span></div>')
            else:
                bars.append(f'<div class="bar" style="--h:{h:.2f}%; --c:{bar.color}"><span class="val">{esc(bar.label)}</span></div>')
        groups.append(f'<div class="group">{"".join(bars)}</div>')
    labels = "".join(f"<div><b>{esc(c.title)}</b>{esc(c.caption)}</div>" for c in columns)
    legend_html = ""
    if legend:
        legend_html = '<div class="legend">' + "".join(
            f'<span style="--c:{color}">{esc(text)}</span>' for text, color in legend
        ) + "</div>"
    return (
        f'<div class="chart" style="--height:{height}px">'
        f'<div class="y-axis">{ticks_html(ticks)}</div>'
        f'<div class="plot">{"".join(groups)}</div>'
        f'<div class="x-axis">{labels}</div>'
        f"</div>{legend_html}"
    )

def linear(top: float) -> Any:
    return lambda v: v / top if top else 0.0

def linear_ticks(top: float, fmt: Any, steps: int = 4) -> list[tuple[float, str]]:
    return [(i / steps, fmt(top * i / steps)) for i in range(steps + 1)]

def log_scale(low: float, high: float) -> Any:
    span = math.log10(high) - math.log10(low)
    return lambda v: (math.log10(v) - math.log10(low)) / span if v > 0 else 0.0

def log_ticks(low: float, high: float, fmt: Any) -> list[tuple[float, str]]:
    first, last = round(math.log10(low)), round(math.log10(high))
    count = last - first
    return [((p - first) / count, fmt(10**p)) for p in range(first, last + 1)]

def nice_top(value: float) -> float:
    if value <= 0:
        return 1.0
    magnitude = 10 ** math.floor(math.log10(value))
    for step in (1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if value <= step * magnitude:
            return step * magnitude
    return 10 * magnitude

def scatter(points_data: list[tuple[str, float, float, str]], low: float, high: float) -> str:
    x = log_scale(low, high)
    dots = []
    for label, cost, quality, color in points_data:
        left = max(0.0, min(1.0, x(cost))) * 100
        bottom = max(0.0, min(1.0, quality)) * 100
        dots.append(
            f'<div class="dot" style="left:{left:.2f}%; bottom:{bottom:.2f}%; --c:{color}">'
            f'<span>{esc(label)}</span></div>'
        )
    x_ticks = "".join(
        f'<span style="left:{pos * 100:.2f}%">{esc(text)}</span>' for pos, text in log_ticks(low, high, usd)
    )
    y_ticks = ticks_html([(i / 4, f"{i * 25}%") for i in range(5)])
    return (
        '<div class="scatter">'
        f'<div class="y-axis">{y_ticks}</div>'
        f'<div class="field">{"".join(dots)}</div>'
        f'<div class="x-ticks">{x_ticks}</div>'
        "</div>"
    )

def strip_plot(rows: list[tuple[str, str, list[tuple[float, str, str]]]]) -> str:
    lines = []
    for title, caption, values in rows:
        dots = "".join(
            f'<i style="left:{v * 100:.2f}%; --c:{color}" title="{esc(tip)}"></i>' for v, color, tip in values
        )
        med = median([v for v, _, _ in values])
        lines.append(
            f'<div class="strip-row"><div class="strip-label"><b>{esc(title)}</b>{esc(caption)}</div>'
            f'<div class="strip-track">{dots}<em style="left:{med * 100:.2f}%"></em></div>'
            f'<div class="strip-med">{pct(med)}</div></div>'
        )
    axis = "".join(f'<span style="left:{i * 25}%">{i * 25}%</span>' for i in range(5))
    return f'<div class="strip">{"".join(lines)}<div class="strip-axis"><div></div><div class="strip-ticks">{axis}</div><div></div></div></div>'

def heat(value: float | None) -> str:
    if value is None:
        return '<td class="heat">–</td>'
    hue = 0 + 130 * max(0.0, min(1.0, (value - 0.5) / 0.5))
    return f'<td class="heat" style="background:hsl({hue:.0f} 70% 88%)">{pct(value)}</td>'

# Sections

def kpi(label: str, value: str, detail: str) -> str:
    return f'<div class="kpi"><div class="label">{esc(label)}</div><div class="value">{value}</div><div class="detail">{detail}</div></div>'

def card(title: str, sub: str, body: str, extra: str = "") -> str:
    return f'<div class="card"><h2>{esc(title)}</h2><p class="sub">{sub}</p>{body}{extra}</div>'

def note(text: str) -> str:
    return f'<p class="note">{text}</p>'

def render(runs: list[RunMetrics]) -> str:
    summaries = summarize(runs)
    es = {v: summaries[(v, "es")] for v in VERSIONS if (v, "es") in summaries}
    current = {lang: summaries[("v6", lang)] for lang in LANGS if ("v6", lang) in summaries}
    first, last = es.get("v1"), es.get("v6")
    sections: list[str] = []

    if first and last:
        sections.append(
            '<section class="kpis">'
            + kpi("Cost per article", change(first.cost, last.cost), f"<s>{usd(first.cost)}</s> → <b>{usd(last.cost)}</b> median, Spanish")
            + kpi("Cost per usable card", change(first.cost_per_usable, last.cost_per_usable), f"<s>{usd(first.cost_per_usable)}</s> → <b>{usd(last.cost_per_usable)}</b>")
            + kpi("Usable cards", points(first.usable_rate, last.usable_rate), f"<s>{pct(first.usable_rate)}</s> → <b>{pct(last.usable_rate)}</b> of words produced")
            + kpi("Time per article", change(first.seconds, last.seconds), f"<s>{first.seconds:.0f}s</s> → <b>{last.seconds:.0f}s</b> median, Spanish")
            + "</section>"
        )

    if es:
        top = nice_top(max(s.cost for s in es.values()))
        cost_cols = [
            Column(v, VERSION_NOTES[v], [Bar(s.cost, VERSION_COLORS[v], usd(s.cost))]) for v, s in es.items()
        ]
        low = 10 ** math.floor(math.log10(max(1e-6, min(s.cost_per_usable for s in es.values() if s.cost_per_usable))))
        high = 10 ** math.ceil(math.log10(max(s.cost_per_usable for s in es.values())))
        if high / low < 100:
            low = high / 1000
        unit_cols = [
            Column(v, VERSION_NOTES[v], [Bar(s.cost_per_usable, VERSION_COLORS[v], usd(s.cost_per_usable))]) for v, s in es.items()
        ]
        sections.append(
            '<section><div class="two">'
            + card(
                "Cost per article",
                "Spanish, median of 5 articles, linear scale",
                column_chart(cost_cols, linear(top), linear_ticks(top, usd)),
                note("Range per version: " + " · ".join(f"{v} {usd(s.cost_range[0])}–{usd(s.cost_range[1])}" for v, s in es.items())),
            )
            + card(
                "Cost per usable card",
                "Total cost divided by cards the judge found fully correct, log scale",
                column_chart(unit_cols, log_scale(low, high), log_ticks(low, high, usd)),
                note("This folds quality into cost: a cheap version that produces bad cards scores worse here."),
            )
            + "</div></section>"
        )

        metric_names = [("Precision", "precision"), ("Gloss accuracy", "gloss_accuracy"), ("Usable cards", "usable_rate")]
        quality_cols = [
            Column(title, "", [Bar(getattr(s, attr), VERSION_COLORS[v], pct(getattr(s, attr))) for v, s in es.items()])
            for title, attr in metric_names
        ]
        sections.append(
            "<section>"
            + card(
                "Quality by version",
                "Spanish, all 5 articles pooled. Precision: valid word in the right dictionary form. Usable: valid, right form and right gloss.",
                column_chart(quality_cols, linear(1.0), linear_ticks(1.0, lambda v: f"{v * 100:.0f}%"), height=280,
                             legend=[(f"{v} · {VERSION_NOTES[v]}", VERSION_COLORS[v]) for v in es]),
            )
            + "</section>"
        )

    scatter_points = [(f"{v} es", s.cost, s.usable_rate, VERSION_COLORS[v]) for v, s in es.items()]
    scatter_points += [(f"v6 {lang}", s.cost, s.usable_rate, LANG_COLORS[lang]) for lang, s in current.items() if lang != "es"]
    if scatter_points:
        costs = [c for _, c, _, _ in scatter_points if c > 0]
        low = 10 ** math.floor(math.log10(min(costs)))
        high = 10 ** math.ceil(math.log10(max(costs)))
        if high / low < 100:
            high = low * 1000
        sections.append(
            '<section class="page-break">'
            + card(
                "Cost against quality",
                "Each point is a version and language: median cost per article (log scale) against the share of usable cards. Up and to the left is better.",
                scatter(scatter_points, low, high),
            )
            + "</section>"
        )

    outcome_cols = []
    for v, s in es.items():
        total = sum(s.outcomes.values()) or 1
        outcome_cols.append(Column(v, "Spanish", [Bar(1.0, "", f"{s.outcomes['usable'] / total * 100:.0f}% usable",
                                                    [(s.outcomes[k], OUTCOME_COLORS[k]) for k in OUTCOME_COLORS])]))
    for lang in ("ru", "zh"):
        if lang in current:
            s = current[lang]
            total = sum(s.outcomes.values()) or 1
            outcome_cols.append(Column("v6", LANG_NAMES[lang], [Bar(1.0, "", f"{s.outcomes['usable'] / total * 100:.0f}% usable",
                                                                   [(s.outcomes[k], OUTCOME_COLORS[k]) for k in OUTCOME_COLORS])]))
    if outcome_cols:
        sections.append(
            "<section>"
            + card(
                "What happened to every word",
                "Share of produced words by the first problem the judge found, all articles pooled",
                column_chart(outcome_cols, linear(1.0), linear_ticks(1.0, lambda v: f"{v * 100:.0f}%"), height=280,
                             legend=[(OUTCOME_LABELS[k], OUTCOME_COLORS[k]) for k in OUTCOME_COLORS]),
            )
            + "</section>"
        )

    if current:
        lang_metrics = [("Precision", "precision"), ("Gloss accuracy", "gloss_accuracy"), ("Reading accuracy", "reading_accuracy"), ("Usable cards", "usable_rate")]
        lang_cols = []
        for title, attr in lang_metrics:
            bars = []
            for lang, s in current.items():
                value = getattr(s, attr)
                if value is None:
                    continue
                bars.append(Bar(value, LANG_COLORS[lang], pct(value)))
            lang_cols.append(Column(title, "", bars))
        top = nice_top(max(s.cost for s in current.values()))
        lang_cost = [Column(LANG_NAMES[lang], f"{s.produced:.0f} words median", [Bar(s.cost, LANG_COLORS[lang], usd(s.cost))]) for lang, s in current.items()]
        sections.append(
            '<section class="page-break"><div class="two">'
            + card(
                "Current version by language",
                "v6, 5 articles × 2 runs per language. Reading accuracy covers Russian stress and Chinese pinyin.",
                column_chart(lang_cols, linear(1.0), linear_ticks(1.0, lambda v: f"{v * 100:.0f}%"), height=260,
                             legend=[(LANG_NAMES[l], LANG_COLORS[l]) for l in current]),
            )
            + card(
                "Cost per article by language",
                "v6 median. Russian includes the Sonnet stress pass; Chinese pinyin is generated in code.",
                column_chart(lang_cost, linear(top), linear_ticks(top, usd), height=260),
            )
            + "</div></section>"
        )

    strip_rows = []
    for v, s in es.items():
        strip_rows.append((v, "Spanish", [(r.usable_rate, VERSION_COLORS[v], f"{r.text} run {r.run}") for r in s.runs]))
    for lang in ("ru", "zh"):
        if lang in current:
            strip_rows.append(("v6", LANG_NAMES[lang], [(r.usable_rate, LANG_COLORS[lang], f"{r.text} run {r.run}") for r in current[lang].runs]))
    if strip_rows:
        sections.append(
            "<section>"
            + card(
                "Spread across articles",
                "Usable-card rate of every single run. The black line marks the median.",
                strip_plot(strip_rows),
            )
            + "</section>"
        )

    by_text: dict[str, dict[str, list[RunMetrics]]] = defaultdict(lambda: defaultdict(list))
    for r in runs:
        by_text[r.text][r.version].append(r)
    rows = []
    for text in sorted(by_text, key=lambda t: (LANGS.index(t[:2]), t)):
        kind = next(iter(by_text[text].values()))[0].kind
        cells = []
        for v in VERSIONS:
            rs = by_text[text].get(v)
            if not rs:
                cells.append('<td class="heat">–</td><td>–</td>')
                continue
            cells.append(heat(Summary(rs).usable_rate) + f"<td>{usd(median([r.cost for r in rs]))}</td>")
        rows.append(f"<tr><td>{esc(text)}</td><td>{esc(kind)}</td>{''.join(cells)}</tr>")
    head = "".join(f'<th colspan="2">{v}</th>' for v in VERSIONS)
    sub_head = "".join("<th>Usable</th><th>Cost</th>" for _ in VERSIONS)
    sections.append(
        "<section>"
        + card(
            "Every article",
            "Usable-card rate (coloured from red at 50% or less to green at 100%) and cost per article. v6 shows the median of 2 runs.",
            f'<div class="table-wrap"><table><thead><tr><th rowspan="2">Article</th><th rowspan="2">Kind</th>{head}</tr><tr>{sub_head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>',
        )
        + "</section>"
    )

    pairs = defaultdict(list)
    for r in runs:
        if r.version == "v6":
            pairs[r.text].append(r)
    stability = []
    for text, rs in sorted(pairs.items()):
        if len(rs) < 2:
            continue
        a, b = rs[0], rs[1]
        overlap = len(a.answers & b.answers) / len(a.answers | b.answers) if a.answers | b.answers else 1.0
        stability.append(
            f"<tr><td>{esc(text)}</td><td>{pct(overlap)}</td><td>{pct(a.usable_rate)} / {pct(b.usable_rate)}</td>"
            f"<td>{usd(a.cost)} / {usd(b.cost)}</td><td>{a.seconds:.1f}s / {b.seconds:.1f}s</td></tr>"
        )
    if stability:
        sections.append(
            "<section>"
            + card(
                "Run-to-run stability",
                "v6 ran twice on every article. Word overlap is the share of answers both runs produced.",
                '<div class="table-wrap"><table><thead><tr><th>Article</th><th>Word overlap</th><th>Usable (run 1 / 2)</th><th>Cost</th><th>Time</th></tr></thead>'
                f'<tbody>{"".join(stability)}</tbody></table></div>',
            )
            + "</section>"
        )

    detail_rows = []
    for (v, lang), s in sorted(summaries.items(), key=lambda kv: (VERSIONS.index(kv[0][0]), LANGS.index(kv[0][1]))):
        tokens_in, tokens_out = s.tokens
        detail_rows.append(
            f"<tr><td>{v}</td><td>{LANG_NAMES[lang]}</td><td>{len(s.runs)}</td><td>{s.produced:.0f}</td><td>{pct(s.precision, 1)}</td>"
            f"<td>{pct(s.gloss_accuracy, 1)}</td><td>{pct(s.reading_accuracy, 1)}</td><td>{pct(s.usable_rate, 1)}</td>"
            f"<td>{tokens_in:,.0f}</td><td>{tokens_out:,.0f}</td><td>{usd(s.cost)}</td><td>{usd(s.cost_per_usable)}</td><td>{s.seconds:.1f}s</td></tr>"
        )
    sections.append(
        '<section class="page-break">'
        + card(
            "All metrics",
            "Quality metrics are pooled over every word; tokens, cost and time are medians per article.",
            '<div class="table-wrap"><table><thead><tr><th>Version</th><th>Language</th><th>Runs</th><th>Words</th><th>Precision</th><th>Gloss</th>'
            "<th>Reading</th><th>Usable</th><th>Input</th><th>Output</th><th>Cost</th><th>Per usable</th><th>Time</th></tr></thead>"
            f'<tbody>{"".join(detail_rows)}</tbody></table></div>',
        )
        + "</section>"
    )

    examples = []
    for key in [("v1", "es"), ("v6", "es"), ("v6", "ru"), ("v6", "zh")]:
        if key not in summaries:
            continue
        seen: set[str] = set()
        picked = []
        for r in summaries[key].runs:
            for word, issue in r.issues:
                if word not in seen:
                    seen.add(word)
                    picked.append(f"<li><b>{esc(word)}</b> — {esc(issue)}</li>")
        if picked:
            examples.append(f"<div><h3>{key[0]} · {LANG_NAMES[key[1]]}</h3><ul>{''.join(picked[:8])}</ul></div>")
    if examples:
        sections.append("<section>" + card("Examples of problems the judge found", "Up to eight per group", f'<div class="examples">{"".join(examples)}</div>') + "</section>")

    return page("".join(sections), runs)

# Page

def judge_spend() -> tuple[float, int]:
    if not LEDGER.exists():
        return 0.0, 0
    ledger = json.loads(LEDGER.read_text())
    return sum(e["cost_usd"] for e in ledger), len(ledger)

def page(body: str, runs: list[RunMetrics]) -> str:
    spend, calls = judge_spend()
    generation = sum(r.cost for r in runs)
    style = (EVALS / "bench_report.css").read_text(encoding="utf-8")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Curator Evaluation Results</title>
<style>
{style}
</style>
</head>
<body>
<main>
  <header class="page">
    <p class="eyebrow">Naozi · Curator service · {datetime.now(UTC):%B %Y}</p>
    <h1>Article-to-vocabulary extraction: quality and cost across versions</h1>
    <p class="lede">
      Every curator version was run on the same 15 frozen texts: 5 each in Spanish, Russian and Chinese, covering encyclopedia, news,
      travel, fiction and literary writing. Older versions only support Spanish. The translation cache was off, so every run paid full price.
      Every word produced was graded by Claude Opus 5.5.
    </p>
  </header>
  {body}
  <footer>
    <p><b>Versions</b>: v1 <code>10894ede</code> · v3 <code>1956a501</code> · v4 <code>630a73a1</code> · v6 <code>d8d9cd22</code>, each run from its own commit. Prompt v2 was never committed.</p>
    <p><b>Metrics</b>: precision = valid word in the correct dictionary form; usable = also a correct gloss and, where present, a correct reading.</p>
    <p><b>Judge</b>: {calls} calls to Claude Opus 5.5 costing {usd(spend)}. Identical words with identical glosses share one grade across versions. The judge was not checked against human grading, so treat absolute numbers as estimates and differences between versions as the stronger signal.</p>
    <p><b>Generation spend</b>: {usd(generation)} across {len(runs)} runs. Pricing per million tokens (input / output): Sonnet 4.6 $3 / $15 · Haiku 5.5 $0.10 / $0.50 · Opus 5.5 $4 / $20.</p>
  </footer>
</main>
</body>
</html>
"""

# Entry point

def main() -> None:
    runs = load_runs()
    if not runs:
        sys.exit("no generations found; run bench_run.py first")
    OUTPUT.write_text(render(runs), encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(EVALS)} from {len(runs)} runs")

if __name__ == "__main__":
    main()
