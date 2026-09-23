"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/client/api";
import type { CourseFormValues, DiacriticMode, Visibility } from "@/lib/client/types";
import { LanguagePicker } from "./LanguagePicker";

// Types

type Props = {
  initial: CourseFormValues;
  submitLabel: string;
  onSubmit: (values: CourseFormValues) => Promise<void>;
};

type Fields = Omit<CourseFormValues, "newPerDay" | "maxReviewsPerDay"> & {
  newPerDay: string;
  maxReviewsPerDay: string;
};

const ROUND_OPTIONS = [3, 4, 5, 6];
const SESSION_SIZE_OPTIONS = [5, 8, 10, 12, 15, 20];

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

// Styles

const INPUT =
  "min-h-11 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-base font-semibold outline-none focus:border-water";
const LABEL = "mb-1 block text-sm font-bold";

const ACCENT_MODES: { value: DiacriticMode; title: string; body: string }[] = [
  { value: "lenient", title: "Lenient", body: "Missing accents are accepted with a reminder." },
  { value: "strict", title: "Strict", body: "Missing accents count as wrong." },
];

// Validation

function validate(fields: Fields): string | null {
  const newPerDay = Number(fields.newPerDay);
  const maxReviews = Number(fields.maxReviewsPerDay);
  if (!fields.title.trim()) return "Add a course title.";
  if (!fields.targetLang.trim() || !fields.sourceLang.trim()) return "Choose both languages.";
  if (!Number.isInteger(newPerDay) || newPerDay < 1 || newPerDay > 100) {
    return "New words per day must be a whole number from 1 to 100.";
  }
  if (!Number.isInteger(maxReviews) || maxReviews < 1 || maxReviews > 2000) {
    return "Reviews per day must be a whole number from 1 to 2000.";
  }
  return null;
}

// Component

export function CourseForm({ initial, submitLabel, onSubmit }: Props) {
  const [fields, setFields] = useState<Fields>({
    ...initial,
    newPerDay: String(initial.newPerDay),
    maxReviewsPerDay: String(initial.maxReviewsPerDay),
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setStatus((s) => (s.kind === "saved" || s.kind === "error" ? { kind: "idle" } : s));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(fields);
    if (problem) {
      setStatus({ kind: "error", message: problem });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      await onSubmit({
        ...fields,
        title: fields.title.trim(),
        description: fields.description.trim(),
        sourceLang: fields.sourceLang.trim().toLowerCase(),
        targetLang: fields.targetLang.trim().toLowerCase(),
        newPerDay: Number(fields.newPerDay),
        maxReviewsPerDay: Number(fields.maxReviewsPerDay),
      });
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err, "The course wasn't saved.") });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <label htmlFor="course-title" className={LABEL}>
          Title
        </label>
        <input
          id="course-title"
          value={fields.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={120}
          placeholder="Spanish for travel"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="course-description" className={LABEL}>
          Description
        </label>
        <textarea
          id="course-description"
          value={fields.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="What this course covers and who it's for"
          className={`${INPUT} font-normal`}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <LanguagePicker
          id="course-target"
          label="Language being taught"
          value={fields.targetLang}
          onChange={(code) => set("targetLang", code)}
        />
        <LanguagePicker
          id="course-source"
          label="Language of the prompts"
          value={fields.sourceLang}
          onChange={(code) => set("sourceLang", code)}
        />
      </div>

      <fieldset>
        <legend className={LABEL}>Accent checking</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACCENT_MODES.map((mode) => (
            <label
              key={mode.value}
              className={`block min-h-11 cursor-pointer rounded-lg border-2 p-3 ${
                fields.diacriticMode === mode.value ? "border-water bg-water/5" : "border-ink/15 bg-white"
              }`}
            >
              <input
                type="radio"
                name="diacritic-mode"
                value={mode.value}
                checked={fields.diacriticMode === mode.value}
                onChange={() => set("diacriticMode", mode.value)}
                className="sr-only"
              />
              <span className="block font-bold">{mode.title}</span>
              <span className="text-sm text-ink/70">{mode.body}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="course-visibility" className={LABEL}>
          Who can see it
        </label>
        <select
          id="course-visibility"
          value={fields.visibility}
          onChange={(e) => set("visibility", e.target.value as Visibility)}
          className={INPUT}
        >
          <option value="private">Only me</option>
          <option value="unlisted">Anyone with the link</option>
          <option value="public">Everyone</option>
        </select>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="course-rounds" className={LABEL}>
            Rounds per new word
          </label>
          <select
            id="course-rounds"
            value={fields.learningSteps}
            onChange={(e) => set("learningSteps", Number(e.target.value))}
            className={INPUT}
          >
            {ROUND_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} rounds
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-ink/60">How many times a new word is tested before it enters reviews.</p>
        </div>
        <div>
          <label htmlFor="course-session-size" className={LABEL}>
            Words per learning session
          </label>
          <select
            id="course-session-size"
            value={fields.wordsPerSession}
            onChange={(e) => set("wordsPerSession", Number(e.target.value))}
            className={INPUT}
          >
            {SESSION_SIZE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} words
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-ink/60">New words introduced in one sitting, up to the daily limit.</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="course-new" className={LABEL}>
            New words per day
          </label>
          <input
            id="course-new"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={fields.newPerDay}
            onChange={(e) => set("newPerDay", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="course-reviews" className={LABEL}>
            Reviews per day
          </label>
          <input
            id="course-reviews"
            type="number"
            inputMode="numeric"
            min={1}
            max={2000}
            value={fields.maxReviewsPerDay}
            onChange={(e) => set("maxReviewsPerDay", e.target.value)}
            className={INPUT}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="min-h-12 w-full rounded-lg bg-leaf px-6 py-3 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-leaf-dark disabled:opacity-60 sm:w-auto"
        >
          {status.kind === "saving" ? "Saving" : submitLabel}
        </button>
        {status.kind === "saved" ? <p className="font-semibold text-leaf-dark">Saved</p> : null}
        {status.kind === "error" ? (
          <p role="alert" className="font-semibold text-berry">
            {status.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}