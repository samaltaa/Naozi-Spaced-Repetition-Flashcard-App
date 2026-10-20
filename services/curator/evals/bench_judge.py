from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import anthropic
import yaml
from dotenv import dotenv_values
from pydantic import BaseModel

# Paths

EVALS = Path(__file__).resolve().parent
SERVICE = EVALS.parent
DATASET = EVALS / "datasets" / "benchmark"
RESULTS = EVALS / "results" / "benchmark"
GENERATIONS = RESULTS / "generations"
REFERENCES = RESULTS / "references"
JUDGMENTS = RESULTS / "judgments.json"
LEDGER = RESULTS / "judge_usage.json"

# Settings

JUDGE_MODEL = "claude-opus-5-5"
EFFORT = "medium"
MAX_TOKENS = 16000
GRADE_BATCH = 40
REFERENCE_SIZE = 40
PRICE_IN, PRICE_OUT = 4.0, 20.0

LANGUAGE_NAMES = {"es": "Spanish", "ru": "Russian", "zh": "Chinese"}

FORM_RULES = {
    "es": "Nouns with their definite article and in the singular (el agua, la mano). Verbs in the infinitive, with -se only when it changes the meaning. Adjectives masculine singular.",
    "ru": "Nouns in the nominative singular (plural only for plural-only nouns). Verbs in the infinitive, in either aspect, keeping -ся when the verb has it. Adjectives masculine nominative singular.",
    "zh": "The word alone in the characters of the text, simplified or traditional, without measure words or particles such as 了, 过, 着, 的.",
}

READING_RULES = {
    "es": "Spanish items have no reading; leave reading_ok empty.",
    "ru": "The reading is the word with an acute accent on the stressed vowel. reading_ok is true only if the stress is on the correct syllable. Leave it empty when there is no reading.",
    "zh": "The reading is pinyin with tone marks. reading_ok is true only if every syllable has the correct pinyin and tone for this word, including neutral tones. Leave it empty when there is no reading.",
}

# Reply models

class ReferenceWord(BaseModel):
    answer: str
    gloss: str

class ReferenceList(BaseModel):
    words: list[ReferenceWord]

class Grade(BaseModel):
    id: int
    valid: bool
    form_ok: bool
    gloss_ok: bool
    reading_ok: bool | None = None
    issue: str | None = None

class GradeBatch(BaseModel):
    items: list[Grade]

# Prompts

REFERENCE_PROMPT = """You are an experienced teacher of {language}. Read the text below and list the words a learner of {language} at B1 level, whose own language is English, should study from it.

Rules:
- Up to {size} words, fewer if the text is short. Order them from most to least useful.
- Only nouns, verbs, adjectives and adverbs that appear in the text.
- Leave out names of people, places, organizations and brands, numbers, abbreviations, and words not in {language}.
- Leave out the most basic words an A2 learner already knows.
- Write each word in dictionary form: {form_rules}
- gloss: its main English meaning, at most two meanings separated by a comma.

Text:
<text>
{text}
</text>"""

GRADE_PROMPT = """You are an experienced teacher of {language} checking vocabulary flashcards made automatically from a text, for a learner whose own language is English. Grade every item.

valid: true when the item is a real {language} word worth studying: a noun, verb, adjective or adverb. false for names of people, places, organizations or brands, fragments or tagging mistakes, abbreviations, words from another language, and leftovers of web pages such as citation or archive wording.

form_ok: true when the answer is the correct dictionary form. Expected forms: {form_rules} Judge invalid items as false.

gloss_ok: true when the English gloss is a correct main meaning of the word. One of two common meanings is fine. It is false when the meaning is wrong, when the part of speech is wrong (a verb glossed as a noun), or when it only fits a narrow sense the word does not usually have.

reading_ok: {reading_rules}

issue: a few words describing the problem when anything is false, otherwise leave it out.

Items (the sentence is only there to show where the word came from):
{items}"""

# Client and usage

def client() -> anthropic.Anthropic:
    key = dotenv_values(SERVICE / ".env").get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit("ANTHROPIC_API_KEY is not set in services/curator/.env")
    return anthropic.Anthropic(api_key=key, timeout=600)

def record_usage(kind: str, usage: Any) -> None:
    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else []
    ledger.append(
        {
            "kind": kind,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cost_usd": round((usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT) / 1_000_000, 6),
        }
    )
    LEDGER.write_text(json.dumps(ledger, indent=2))

def ask(api: anthropic.Anthropic, prompt: str, schema: type[BaseModel], kind: str) -> Any:
    response = api.messages.parse(
        model=JUDGE_MODEL,
        max_tokens=MAX_TOKENS,
        output_config={"effort": EFFORT},
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
    )
    record_usage(kind, response.usage)
    if response.stop_reason == "refusal":
        raise RuntimeError(f"judge refused: {response.stop_details}")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise RuntimeError(f"judge reply incomplete: {response.stop_reason}")
    return response.parsed_output

# References

def texts() -> list[dict[str, str]]:
    return yaml.safe_load((DATASET / "sources.yaml").read_text(encoding="utf-8"))["texts"]

def build_reference(api: anthropic.Anthropic, text: dict[str, str]) -> None:
    out = REFERENCES / f"{text['name']}.json"
    if out.exists():
        return
    body = (DATASET / "texts" / f"{text['name']}.txt").read_text(encoding="utf-8")
    lang = text["language"]
    prompt = REFERENCE_PROMPT.format(
        language=LANGUAGE_NAMES[lang], size=REFERENCE_SIZE, form_rules=FORM_RULES[lang], text=body
    )
    print(f"  reference for {text['name']}...", flush=True)
    reply: ReferenceList = ask(api, prompt, ReferenceList, "reference")
    out.write_text(json.dumps([w.model_dump() for w in reply.words], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"    {len(reply.words)} words")

# Grading

def grade_key(lang: str, item: dict[str, Any]) -> str:
    parts = [lang, item["answer"], item["prompt"], item.get("reading") or "", item.get("pos") or ""]
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:24]

def load_judgments() -> dict[str, dict[str, Any]]:
    return json.loads(JUDGMENTS.read_text(encoding="utf-8")) if JUDGMENTS.exists() else {}

def save_judgments(judgments: dict[str, dict[str, Any]]) -> None:
    JUDGMENTS.write_text(json.dumps(judgments, ensure_ascii=False, indent=1), encoding="utf-8")

def item_lines(items: list[dict[str, Any]]) -> str:
    rows = []
    for number, item in enumerate(items, start=1):
        row = {"id": number, "answer": item["answer"], "pos": item.get("pos"), "gloss": item["prompt"]}
        if item.get("reading"):
            row["reading"] = item["reading"]
        if item.get("context"):
            row["sentence"] = item["context"]
        rows.append(row)
    return "\n".join(json.dumps(row, ensure_ascii=False) for row in rows)

def grade_items(api: anthropic.Anthropic, lang: str, items: list[dict[str, Any]], judgments: dict[str, dict[str, Any]]) -> None:
    pending = {grade_key(lang, item): item for item in items if grade_key(lang, item) not in judgments}
    queue = list(pending.items())
    for start in range(0, len(queue), GRADE_BATCH):
        chunk = queue[start : start + GRADE_BATCH]
        prompt = GRADE_PROMPT.format(
            language=LANGUAGE_NAMES[lang],
            form_rules=FORM_RULES[lang],
            reading_rules=READING_RULES[lang],
            items=item_lines([item for _, item in chunk]),
        )
        print(f"    grading {len(chunk)} items...", flush=True)
        reply: GradeBatch = ask(api, prompt, GradeBatch, "grade")
        grades = {g.id: g for g in reply.items}
        for number, (key, item) in enumerate(chunk, start=1):
            grade = grades.get(number)
            if grade is None:
                continue
            judgments[key] = {"answer": item["answer"], "prompt": item["prompt"], **grade.model_dump(exclude={"id"})}
        save_judgments(judgments)

def grade_generations(api: anthropic.Anthropic) -> None:
    judgments = load_judgments()
    for path in sorted(GENERATIONS.glob("*.json")):
        run = json.loads(path.read_text(encoding="utf-8"))
        missing = [i for i in run["items"] if grade_key(run["language"], i) not in judgments]
        if not missing:
            continue
        print(f"  {path.stem}: {len(missing)} new items", flush=True)
        grade_items(api, run["language"], missing, judgments)

# Entry point

def main() -> None:
    parser = argparse.ArgumentParser(description="Build reference lists and grade generated items")
    parser.add_argument("step", choices=["references", "grade", "all"])
    args = parser.parse_args()

    REFERENCES.mkdir(parents=True, exist_ok=True)
    api = client()
    if args.step in ("references", "all"):
        print("references")
        for text in texts():
            build_reference(api, text)
    if args.step in ("grade", "all"):
        print("grading")
        grade_generations(api)

    if LEDGER.exists():
        ledger = json.loads(LEDGER.read_text())
        print(f"judge spend so far: ${sum(e['cost_usd'] for e in ledger):.4f} over {len(ledger)} calls")

if __name__ == "__main__":
    main()
