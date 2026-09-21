"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { accentsFor } from "@/lib/client/languages";
import type { Question, ReviewResult } from "@/lib/client/types";
import { AccentBar } from "./AccentBar";

type TypingQuestionData = Extract<Question, { kind: "typing" }>;

type Props = {
  question: TypingQuestionData;
  result: ReviewResult | null;
  disabled: boolean;
  onSubmit: (answer: string) => void;
};

function inputTone(result: ReviewResult | null): string {
  if (!result) return "border-ink/20 bg-white focus:border-water";
  if (!result.correct) return "border-berry bg-berry/10";
  return result.verdict === "exact" ? "border-leaf bg-leaf/10" : "border-sun bg-sun/15";
}

export function TypingQuestion({ question, result, disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const accents = accentsFor(question.targetLang);

  const submit = () => {
    if (!disabled && value.trim()) onSubmit(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  const insert = (char: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + char + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + char.length, start + char.length);
    });
  };

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          dir="auto"
          lang={question.targetLang}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="Your answer"
          placeholder="Type the answer"
          className={`min-h-14 min-w-0 flex-1 rounded-xl border-2 px-4 py-3 text-xl font-bold sm:text-2xl outline-none placeholder:font-normal placeholder:text-ink/30 ${inputTone(result)}`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="min-h-14 shrink-0 rounded-xl bg-water px-4 text-lg font-bold sm:px-6 text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-water-dark disabled:bg-ink/20 disabled:shadow-none"
        >
          Check
        </button>
      </div>
      {accents.length > 0 ? <AccentBar chars={accents} disabled={disabled} onInsert={insert} /> : null}
    </div>
  );
}