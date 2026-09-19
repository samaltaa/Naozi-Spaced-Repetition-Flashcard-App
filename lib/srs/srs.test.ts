import { describe, expect, it } from "vitest";
import {
  checkChoice,
  checkTyped,
  dueAfterDays,
  gradeFromCheck,
  initialCard,
  pickDistractors,
  planLearnSession,
  schedule,
  startOfUserDay,
  updateEase,
  type CardState,
  type SessionItem,
  type SrsSettings,
} from "./index";

// Fixtures

const settings: SrsSettings = {
  learningSteps: 3,
  graduatingIntervalDays: 1,
  timezone: "UTC",
  rolloverHour: 4,
  locale: "es",
  diacriticMode: "lenient",
};

const now = new Date("2026-09-19T12:00:00Z");
const fixedRng = () => 0.42;

const item = (id: string, answer: string, levelId = "l1"): SessionItem => ({
  id,
  levelId,
  prompt: `prompt ${id}`,
  answer,
  alternates: [],
  reading: null,
  notes: null,
});

// Answer checking

describe("checkTyped", () => {
  const lenient = { locale: "es", diacriticMode: "lenient" as const };
  const strict = { locale: "es", diacriticMode: "strict" as const };

  it("accepts exact answers ignoring case, spacing and punctuation", () => {
    expect(checkTyped("  El   Perro! ", ["el perro"], lenient).verdict).toBe("exact");
  });

  it("matches composed and decomposed accents", () => {
    expect(checkTyped("el a\u0301rbol", ["el árbol"], strict).verdict).toBe("exact");
  });

  it("flags missing accents in lenient mode", () => {
    expect(checkTyped("el arbol", ["el árbol"], lenient).verdict).toBe("accents");
  });

  it("rejects missing accents in strict mode", () => {
    expect(checkTyped("el arbol", ["el árbol"], strict).verdict).toBe("wrong");
  });

  it("accepts one typo on medium words", () => {
    expect(checkTyped("el pero", ["el perro"], lenient).verdict).toBe("typo");
  });

  it("allows no typos on short words", () => {
    expect(checkTyped("sre", ["ser"], lenient).verdict).toBe("wrong");
  });

  it("accepts alternates", () => {
    expect(checkTyped("comprender", ["entender", "comprender"], lenient)).toEqual({
      verdict: "exact",
      matched: "comprender",
    });
  });

  it("does not strip Japanese dakuten", () => {
    expect(checkTyped("か", ["が"], { locale: "ja", diacriticMode: "lenient" }).verdict).toBe("wrong");
  });

  it("rejects empty input", () => {
    expect(checkTyped("   ", ["ser"], lenient).verdict).toBe("wrong");
  });
});

describe("checkChoice", () => {
  it("requires an exact option match", () => {
    expect(checkChoice("el gato", "el perro", "es").verdict).toBe("wrong");
    expect(checkChoice("El perro", "el perro", "es").verdict).toBe("exact");
  });
});

// Grading

describe("gradeFromCheck", () => {
  it("maps verdicts and speed to grades", () => {
    expect(gradeFromCheck({ verdict: "wrong", matched: null }, "typing", 1000)).toBe(1);
    expect(gradeFromCheck({ verdict: "exact", matched: "x" }, "typing", 1000)).toBe(5);
    expect(gradeFromCheck({ verdict: "exact", matched: "x" }, "typing", 20_000)).toBe(4);
    expect(gradeFromCheck({ verdict: "typo", matched: "x" }, "typing", 1000)).toBe(3);
    expect(gradeFromCheck({ verdict: "exact", matched: "x" }, "multiple_choice", 1000)).toBe(4);
  });
});

// Scheduling

describe("schedule", () => {
  it("graduates after all learning steps pass", () => {
    let card: CardState = initialCard();
    card = schedule(card, 4, now, settings);
    expect(card).toMatchObject({ state: "learning", learningStep: 1 });
    card = schedule(card, 4, now, settings);
    expect(card).toMatchObject({ state: "learning", learningStep: 2 });
    card = schedule(card, 5, now, settings);
    expect(card).toMatchObject({ state: "review", repetitions: 1, intervalDays: 1 });
    expect(card.dueAt?.toISOString()).toBe("2026-09-20T04:00:00.000Z");
  });

  it("keeps the learning step on failure", () => {
    const card = schedule({ ...initialCard(), state: "learning", learningStep: 1 }, 1, now, settings);
    expect(card).toMatchObject({ state: "learning", learningStep: 1 });
  });

  it("follows SM-2 intervals 1, 6, then interval times ease", () => {
    let card: CardState = { ...initialCard(), state: "review", repetitions: 1, intervalDays: 1 };
    card = schedule(card, 5, now, settings);
    expect(card).toMatchObject({ repetitions: 2, intervalDays: 6, easeFactor: 2.6 });
    card = schedule(card, 5, now, settings);
    expect(card).toMatchObject({ repetitions: 3, intervalDays: 16, easeFactor: 2.7 });
  });

  it("avoids float drift when multiplying intervals", () => {
    const card = schedule(
      { ...initialCard(), state: "review", repetitions: 3, intervalDays: 10, easeFactor: 2.7 },
      4,
      now,
      settings,
    );
    expect(card.intervalDays).toBe(27);
  });

  it("sends failed reviews to relearning and back", () => {
    let card: CardState = { ...initialCard(), state: "review", repetitions: 4, intervalDays: 30 };
    card = schedule(card, 1, now, settings);
    expect(card).toMatchObject({ state: "relearning", repetitions: 0, lapses: 1 });
    card = schedule(card, 5, now, settings);
    expect(card).toMatchObject({ state: "review", repetitions: 1, intervalDays: 1 });
  });

  it("never drops ease below 1.3", () => {
    expect(updateEase(1.35, 3)).toBe(1.3);
  });
});

// Time

describe("day boundaries", () => {
  it("respects timezone and rollover hour", () => {
    const late = new Date("2026-09-19T03:00:00Z");
    expect(startOfUserDay(late, "America/Santo_Domingo", 4).toISOString()).toBe("2026-09-18T08:00:00.000Z");
    expect(dueAfterDays(late, 1, "America/Santo_Domingo", 4).toISOString()).toBe("2026-09-19T08:00:00.000Z");
  });
});

// Sessions

describe("sessions", () => {
  const pool = [item("a", "el perro"), item("b", "el gato"), item("c", "la casa"), item("d", "el perro")];

  it("never offers duplicate or correct answers as distractors", () => {
    const distractors = pickDistractors(item("a", "el perro"), pool, 3, "es", fixedRng);
    expect(distractors).not.toContain("el perro");
    expect(new Set(distractors).size).toBe(distractors.length);
  });

  it("plans intro, choice, choice, typing for each new item", () => {
    const steps = planLearnSession([pool[0]!, pool[1]!], pool, settings, fixedRng);
    const kinds = steps.map((s) => (s.type === "intro" ? "intro" : s.question.kind));
    expect(kinds.filter((k) => k === "intro")).toHaveLength(2);
    expect(kinds.filter((k) => k === "multiple_choice")).toHaveLength(4);
    expect(kinds.filter((k) => k === "typing")).toHaveLength(2);
  });
});