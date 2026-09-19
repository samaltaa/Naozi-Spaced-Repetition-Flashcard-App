import { dueAfterDays } from "./time";
import type { AnswerCheck, CardState, Grade, SrsSettings, TestType } from "./types";

// Constants

const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const PASSING_GRADE = 3;
const FAST_CHOICE_MS = 6_000;
const FAST_TYPING_MS = 10_000;

// Grading

export function gradeFromCheck(check: AnswerCheck, testType: TestType, responseMs: number): Grade {
  if (check.verdict === "wrong") return 1;
  if (testType === "multiple_choice") return responseMs <= FAST_CHOICE_MS ? 4 : 3;
  if (check.verdict === "typo") return 3;
  if (check.verdict === "accents") return 4;
  return responseMs <= FAST_TYPING_MS ? 5 : 4;
}

// Ease

export function updateEase(ease: number, grade: Grade): number {
  const miss = 5 - grade;
  const next = ease + (0.1 - miss * (0.08 + miss * 0.02));
  return Math.max(MIN_EASE, Math.round(next * 100) / 100);
}

function nextInterval(card: CardState, repetitions: number): number {
  if (repetitions === 1) return 1;
  if (repetitions === 2) return 6;
  return Math.ceil(Math.round(card.intervalDays * card.easeFactor * 1e6) / 1e6);
}

// Card lifecycle

export function initialCard(): CardState {
  return {
    state: "new",
    easeFactor: INITIAL_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    dueAt: null,
    lastReviewedAt: null,
  };
}

function graduate(card: CardState, intervalDays: number, now: Date, settings: SrsSettings): CardState {
  return {
    ...card,
    state: "review",
    learningStep: 0,
    repetitions: 1,
    intervalDays,
    dueAt: dueAfterDays(now, intervalDays, settings.timezone, settings.rolloverHour),
  };
}

export function schedule(card: CardState, grade: Grade, now: Date, settings: SrsSettings): CardState {
  const passed = grade >= PASSING_GRADE;
  const base: CardState = { ...card, lastReviewedAt: now };

  switch (card.state) {
    case "new":
    case "learning": {
      if (!passed) return { ...base, state: "learning", dueAt: now };
      const step = card.learningStep + 1;
      if (step < settings.learningSteps) return { ...base, state: "learning", learningStep: step, dueAt: now };
      return graduate(base, settings.graduatingIntervalDays, now, settings);
    }
    case "relearning": {
      return passed ? graduate(base, 1, now, settings) : { ...base, dueAt: now };
    }
    case "review": {
      if (!passed) {
        return {
          ...base,
          state: "relearning",
          repetitions: 0,
          lapses: card.lapses + 1,
          learningStep: 0,
          intervalDays: 0,
          dueAt: now,
        };
      }
      const repetitions = card.repetitions + 1;
      const intervalDays = nextInterval(card, repetitions);
      return {
        ...base,
        repetitions,
        intervalDays,
        easeFactor: updateEase(card.easeFactor, grade),
        dueAt: dueAfterDays(now, intervalDays, settings.timezone, settings.rolloverHour),
      };
    }
    default: {
      const unreachable: never = card.state;
      throw new Error(`Unknown state: ${String(unreachable)}`);
    }
  }
}