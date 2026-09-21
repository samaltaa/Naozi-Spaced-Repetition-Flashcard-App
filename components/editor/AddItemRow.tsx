"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { errorMessage } from "@/lib/client/api";
import { draftToInput, EMPTY_DRAFT } from "@/lib/client/editor";
import type { ItemDraft, ItemInput } from "@/lib/client/types";
import { Field, ROW_GRID } from "./ItemRow";

type Props = {
  lang: string;
  sourceLabel: string;
  targetLabel: string;
  onCreate: (input: ItemInput) => Promise<void>;
};

export function AddItemRow({ lang, sourceLabel, targetLabel, onCreate }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const promptRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof ItemDraft) => (value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };

  const create = async () => {
    if (busy) return;
    if (!draft.prompt.trim() || !draft.answer.trim()) {
      setError("Fill in the word and its translation.");
      return;
    }
    setBusy(true);
    try {
      await onCreate(draftToInput(draft));
      setDraft(EMPTY_DRAFT);
      promptRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err, "The word wasn't added."));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    void create();
  };

  return (
    <li className={`flex flex-col gap-2 border-t border-ink/10 bg-leaf/5 px-3 py-4 md:px-2 md:py-2 ${ROW_GRID}`}>
      <span className="text-sm font-bold text-leaf-dark md:px-1">
        +<span className="md:sr-only"> New word</span>
      </span>

      <Field
        label={sourceLabel}
        value={draft.prompt}
        onChange={set("prompt")}
        onKeyDown={onKeyDown}
        placeholder="Add a word"
        tone="boxed"
        inputRef={promptRef}
      />
      <Field
        label={targetLabel}
        value={draft.answer}
        onChange={set("answer")}
        onKeyDown={onKeyDown}
        lang={lang}
        placeholder="Translation"
        weight="bold"
        tone="boxed"
      />

      <div className={`${expanded ? "flex" : "hidden"} flex-col gap-2 md:contents`}>
        <Field
          label="Also accepted"
          value={draft.alternates}
          onChange={set("alternates")}
          onKeyDown={onKeyDown}
          lang={lang}
          placeholder="Optional, comma separated"
          tone="boxed"
        />
        <Field
          label="Reading"
          value={draft.reading}
          onChange={set("reading")}
          onKeyDown={onKeyDown}
          lang={lang}
          placeholder="Optional"
          tone="boxed"
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="min-h-11 self-start text-sm font-bold text-water md:hidden"
      >
        {expanded ? "Hide extra fields" : "Also accepted and reading"}
      </button>

      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="min-h-11 w-full rounded-md bg-leaf px-3 text-sm font-bold text-white hover:bg-leaf-dark disabled:opacity-50 md:w-auto"
      >
        Add
      </button>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-berry md:col-span-6 md:px-1">
          {error}
        </p>
      ) : null}
    </li>
  );
}