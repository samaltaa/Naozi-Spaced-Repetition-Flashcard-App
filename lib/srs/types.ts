// Primitives

export type ItemState = "new" | "learning" | "review" | "relearning";
export type TestType = "multiple_choice" | "typing";
export type DiacriticMode = "strict" | "lenient";
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
export type Verdict = "exact" | "accents" | "typo" | "wrong";
export type Rng = () => number;

// Scheduling

export interface CardState {
  state: ItemState;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  learningStep: number;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
}

export interface SrsSettings {
  learningSteps: number;
  graduatingIntervalDays: number;
  timezone: string;
  rolloverHour: number;
  locale: string;
  diacriticMode: DiacriticMode;
}

// Answers

export interface AnswerCheck {
  verdict: Verdict;
  matched: string | null;
}

// Sessions

export interface PoolItem {
  id: string;
  levelId: string;
  answer: string;
  alternates: string[];
}

export interface SessionItem extends PoolItem {
  prompt: string;
  reading: string | null;
  notes: string | null;
}

export type Question =
  | {
      kind: "multiple_choice";
      itemId: string;
      prompt: string;
      reading: string | null;
      options: string[];
    }
  | {
      kind: "typing";
      itemId: string;
      prompt: string;
      reading: string | null;
      targetLang: string;
    };

export type SessionStep =
  | {
      type: "intro";
      itemId: string;
      prompt: string;
      answer: string;
      reading: string | null;
      notes: string | null;
    }
  | {
      type: "question";
      question: Question;
    };