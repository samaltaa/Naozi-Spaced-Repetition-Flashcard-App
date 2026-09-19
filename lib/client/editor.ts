import type { CourseFormValues, CourseItem, CourseRecord, ItemDraft, ItemInput, UpdateItemInput } from "./types";

// Courses

export const DEFAULT_COURSE: CourseFormValues = {
  title: "",
  description: "",
  sourceLang: "en",
  targetLang: "",
  visibility: "private",
  diacriticMode: "lenient",
  newPerDay: 10,
  maxReviewsPerDay: 200,
};

export function toFormValues(course: CourseRecord): CourseFormValues {
  return {
    title: course.title,
    description: course.description,
    sourceLang: course.source_lang,
    targetLang: course.target_lang,
    visibility: course.visibility,
    diacriticMode: course.diacritic_mode,
    newPerDay: course.new_per_day,
    maxReviewsPerDay: course.max_reviews_per_day,
  };
}

// Items

export const EMPTY_DRAFT: ItemDraft = { prompt: "", answer: "", alternates: "", reading: "" };

export function parseAlternates(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toDraft(item: CourseItem): ItemDraft {
  return {
    prompt: item.prompt,
    answer: item.answer,
    alternates: item.alternates.join(", "),
    reading: item.reading ?? "",
  };
}

export function draftToInput(draft: ItemDraft): ItemInput {
  return {
    prompt: draft.prompt.trim(),
    answer: draft.answer.trim(),
    alternates: parseAlternates(draft.alternates),
    reading: draft.reading.trim() || null,
  };
}

export function draftChanges(saved: ItemDraft, draft: ItemDraft): UpdateItemInput | null {
  const before = draftToInput(saved);
  const after = draftToInput(draft);
  const changes: UpdateItemInput = {};
  if (after.prompt !== before.prompt) changes.prompt = after.prompt;
  if (after.answer !== before.answer) changes.answer = after.answer;
  if (after.alternates?.join("\u0000") !== before.alternates?.join("\u0000")) changes.alternates = after.alternates;
  if (after.reading !== before.reading) changes.reading = after.reading;
  return Object.keys(changes).length > 0 ? changes : null;
}