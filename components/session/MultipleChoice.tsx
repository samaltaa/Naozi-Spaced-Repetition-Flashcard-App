"use client";

import { useEffect } from "react";
import type { Question, ReviewResult } from "@/lib/client/types";

type ChoiceQuestion = Extract<Question, { kind: "multiple_choice" }>;

type Props = {
  question: ChoiceQuestion;
  lang: string | undefined;
  picked: string | null;
  result: ReviewResult | null;
  disabled: boolean;
  onPick: (option: string) => void;
};

function optionTone(option: string, picked: string | null, result: ReviewResult | null): string {
  if (!result) {
    return option === picked
      ? "border-water bg-water/10"
      : "border-ink/15 bg-white hover:border-water hover:bg-water/5";
  }
  if (option === result.correctAnswer) return "border-leaf bg-leaf text-white";
  if (option === picked) return "border-berry bg-berry text-white";
  return "border-ink/10 bg-white opacity-40";
}

export function MultipleChoice({ question, lang, picked, result, disabled, onPick }: Props) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      const option = Number.isInteger(n) && n >= 1 ? question.options[n - 1] : undefined;
      if (option !== undefined) {
        e.preventDefault();
        onPick(option);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, question.options, onPick]);

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      {question.options.map((option, i) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option)}
          className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg font-bold sm:py-4 sm:text-xl transition-colors disabled:cursor-default ${optionTone(option, picked, result)}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current text-sm opacity-60 pointer-coarse:hidden">
            {i + 1}
          </span>
          <span dir="auto" lang={lang} className="min-w-0 break-words">
            {option}
          </span>
        </button>
      ))}
    </div>
  );
}