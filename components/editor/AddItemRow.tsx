"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { errorMessage } from "@/lib/client/api";
import { draftToInput, EMPTY_DRAFT } from "@/lib/client/editor";
import type { ItemDraft, ItemInput } from "@/lib/client/types";
import { CELL_INPUT } from "./ItemRow";

type Props = {
  lang: string;
  onCreate: (input: ItemInput) => Promise<void>;
};

export function AddItemRow({ lang, onCreate }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof ItemDraft, value: string) => {
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

  const field = `${CELL_INPUT} border-ink/10 bg-white`;

  return (
    <>
      <tr className="border-t border-ink/10 bg-leaf/5">
        <td className="px-3 text-sm font-bold text-leaf-dark">+</td>
        <td className="py-2">
          <input
            ref={promptRef}
            value={draft.prompt}
            onChange={(e) => set("prompt", e.target.value)}
            onKeyDown={onKeyDown}
            dir="auto"
            placeholder="Add a word"
            aria-label="New word prompt"
            className={field}
          />
        </td>
        <td className="py-2">
          <input
            value={draft.answer}
            onChange={(e) => set("answer", e.target.value)}
            onKeyDown={onKeyDown}
            dir="auto"
            lang={lang}
            placeholder="Translation"
            aria-label="New word answer"
            className={`${field} font-bold`}
          />
        </td>
        <td className="py-2">
          <input
            value={draft.alternates}
            onChange={(e) => set("alternates", e.target.value)}
            onKeyDown={onKeyDown}
            dir="auto"
            lang={lang}
            placeholder="Optional, comma separated"
            aria-label="New word other accepted answers"
            className={field}
          />
        </td>
        <td className="py-2">
          <input
            value={draft.reading}
            onChange={(e) => set("reading", e.target.value)}
            onKeyDown={onKeyDown}
            dir="auto"
            lang={lang}
            placeholder="Optional"
            aria-label="New word reading"
            className={field}
          />
        </td>
        <td className="px-2 text-right">
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="rounded-md bg-leaf px-3 py-1.5 text-sm font-bold text-white hover:bg-leaf-dark disabled:opacity-50"
          >
            Add
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={6} role="alert" className="px-3 pb-3 text-sm font-semibold text-berry">
            {error}
          </td>
        </tr>
      ) : null}
    </>
  );
}