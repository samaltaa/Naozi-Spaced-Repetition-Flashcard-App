"use client";

import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { draftChanges, toDraft } from "@/lib/client/editor";
import type { CourseItem, ItemDraft, UpdateItemInput } from "@/lib/client/types";

// Types

type Props = {
  item: CourseItem;
  number: number;
  lang: string;
  onSave: (itemId: string, changes: UpdateItemInput) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
};

type Status = "idle" | "saving" | "error";

// Cell

export const CELL_INPUT =
  "w-full rounded-md border-2 border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-ink/10 focus:border-water focus:bg-white";

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

// Row

export function ItemRow({ item, number, lang, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(() => toDraft(item));
  const [status, setStatus] = useState<Status>("idle");
  const saved = useRef<ItemDraft>(toDraft(item));

  const set = (key: keyof ItemDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const commit = async () => {
    const changes = draftChanges(saved.current, draft);
    if (!changes) return;
    if (!draft.prompt.trim() || !draft.answer.trim()) {
      setDraft(saved.current);
      return;
    }
    const snapshot = draft;
    setStatus("saving");
    try {
      await onSave(item.id, changes);
      saved.current = snapshot;
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const onRowBlur = (e: FocusEvent<HTMLTableRowElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void commit();
  };

  const remove = async () => {
    setStatus("saving");
    try {
      await onDelete(item.id);
    } catch {
      setStatus("error");
    }
  };

  return (
    <tr onBlur={onRowBlur} className="border-t border-ink/5 align-middle">
      <td className="px-3 text-sm tabular-nums">
        {status === "error" ? (
          <span className="font-bold text-berry" title="Not saved. Edit the row to retry.">
            !
          </span>
        ) : (
          <span className={status === "saving" ? "text-water" : "text-ink/40"}>{number}</span>
        )}
      </td>
      <td className="py-1">
        <input
          value={draft.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          onKeyDown={blurOnEnter}
          dir="auto"
          aria-label={`Word ${number} prompt`}
          className={CELL_INPUT}
        />
      </td>
      <td className="py-1">
        <input
          value={draft.answer}
          onChange={(e) => set("answer", e.target.value)}
          onKeyDown={blurOnEnter}
          dir="auto"
          lang={lang}
          aria-label={`Word ${number} answer`}
          className={`${CELL_INPUT} font-bold`}
        />
      </td>
      <td className="py-1">
        <input
          value={draft.alternates}
          onChange={(e) => set("alternates", e.target.value)}
          onKeyDown={blurOnEnter}
          dir="auto"
          lang={lang}
          aria-label={`Word ${number} other accepted answers`}
          className={`${CELL_INPUT} text-ink/80`}
        />
      </td>
      <td className="py-1">
        <input
          value={draft.reading}
          onChange={(e) => set("reading", e.target.value)}
          onKeyDown={blurOnEnter}
          dir="auto"
          lang={lang}
          aria-label={`Word ${number} reading`}
          className={`${CELL_INPUT} text-ink/80`}
        />
      </td>
      <td className="px-2 text-right">
        <button
          type="button"
          onClick={remove}
          disabled={status === "saving"}
          aria-label={`Delete word ${number}`}
          className="rounded-md p-1.5 text-ink/30 hover:bg-berry/10 hover:text-berry disabled:opacity-40"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}