import { graphemes, normalizeAnswer } from "./answer";
import type { CardState, PoolItem, Question, Rng, SessionItem, SessionStep, SrsSettings, TestType } from "./types";

// Constants

const DISTRACTOR_COUNT = 3;
const MIXED_TEST_MAX_INTERVAL = 7;
const OTHER_LEVEL_PENALTY = 100;

// Randomness

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

// Distractors

export function pickDistractors(
  target: PoolItem,
  pool: readonly PoolItem[],
  count: number,
  locale: string,
  rng: Rng,
): string[] {
  const seen = new Set([target.answer, ...target.alternates].map((a) => normalizeAnswer(a, locale)));
  const targetLength = graphemes(target.answer).length;
  const candidates: { answer: string; score: number }[] = [];

  for (const item of shuffle(pool, rng)) {
    const key = normalizeAnswer(item.answer, locale);
    if (item.id === target.id || seen.has(key)) continue;
    seen.add(key);
    const levelPenalty = item.levelId === target.levelId ? 0 : OTHER_LEVEL_PENALTY;
    const lengthGap = Math.abs(graphemes(item.answer).length - targetLength);
    candidates.push({ answer: item.answer, score: levelPenalty + lengthGap });
  }

  return candidates
    .toSorted((a, b) => a.score - b.score)
    .slice(0, count)
    .map((c) => c.answer);
}

// Test types

export function learningTestType(step: number, settings: SrsSettings): TestType {
  return step < settings.learningSteps - 1 ? "multiple_choice" : "typing";
}

export function testTypeForCard(card: CardState, settings: SrsSettings, rng: Rng): TestType {
  switch (card.state) {
    case "new":
    case "learning":
      return learningTestType(card.learningStep, settings);
    case "relearning":
      return "typing";
    case "review":
      return card.intervalDays < MIXED_TEST_MAX_INTERVAL && rng() < 0.5 ? "multiple_choice" : "typing";
    default: {
      const unreachable: never = card.state;
      throw new Error(`Unknown state: ${String(unreachable)}`);
    }
  }
}

// Questions

export function buildQuestion(
  item: SessionItem,
  testType: TestType,
  pool: readonly PoolItem[],
  settings: SrsSettings,
  rng: Rng,
): Question {
  if (testType === "multiple_choice") {
    const distractors = pickDistractors(item, pool, DISTRACTOR_COUNT, settings.locale, rng);
    if (distractors.length > 0) {
      return {
        kind: "multiple_choice",
        itemId: item.id,
        prompt: item.prompt,
        reading: item.reading,
        options: shuffle([item.answer, ...distractors], rng),
      };
    }
  }
  return {
    kind: "typing",
    itemId: item.id,
    prompt: item.prompt,
    reading: item.reading,
    targetLang: settings.locale,
  };
}

// Sessions

export function planLearnSession(
  items: readonly SessionItem[],
  pool: readonly PoolItem[],
  settings: SrsSettings,
  rng: Rng = Math.random,
): SessionStep[] {
  const steps: SessionStep[] = [];
  for (let round = 0; round < settings.learningSteps; round++) {
    const order = round === 0 ? items : shuffle(items, rng);
    for (const item of order) {
      if (round === 0) {
        steps.push({
          type: "intro",
          itemId: item.id,
          prompt: item.prompt,
          answer: item.answer,
          reading: item.reading,
          notes: item.notes,
        });
      }
      const testType = learningTestType(round, settings);
      steps.push({ type: "question", question: buildQuestion(item, testType, pool, settings, rng) });
    }
  }
  return steps;
}

export function planReviewSession(
  entries: readonly { item: SessionItem; card: CardState }[],
  pool: readonly PoolItem[],
  settings: SrsSettings,
  rng: Rng = Math.random,
): SessionStep[] {
  return entries.map(({ item, card }) => ({
    type: "question",
    question: buildQuestion(item, testTypeForCard(card, settings, rng), pool, settings, rng),
  }));
}