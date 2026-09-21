"use client";

import { useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { draftChanges, toDraft } from "@/lib/client/editor";
import type { CourseItem, ItemDraft, UpdateItemInput } from "@/lib/client/types";

// Layout

export const ROW_GRID =
  "md:grid md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3.5rem] md:items-center md:gap-2";

const INPUT_TONES = {
  cell: "border-ink/10 bg-white md:min-h-10 md:border-transparent md:bg-transparent md:hover:border-ink/10 md:focus:bg-white",
  boxed: "border-ink/15 bg-white md:min-h-10",
};

// Field

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  lang?: string;
  placeholder?: string;
  weight?: "bold" | "muted";
  tone?: keyof typeof INPUT_TONES;
  inputRef?: Ref<HTMLInputElement>;
};

export function Field({
  label,
  value,
  onChange,
  onKeyDown,
  lang,
  placeholder,
  weight,
  tone = "cell",
  inputRef,
}: FieldProps) {
  const text = weight === "bold" ? "font-bold" : weight === "muted" ? "text-ink/80" : "";
  return (
    <label className="block md:contents">
      <span className="mb-1 block text-xs font-bold text-ink/50 md:sr-only">{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        dir="auto"
        lang={lang}
        placeholder={placeholder}
        className={`min-h-11 w-full rounded-md border-2 px-2 py-1.5 text-base outline-none focus:border-water ${INPUT_TONES[tone]} ${text}`}
      />
    </label>
  );
}

// Delete

function DeleteButton({ label, disabled, onClick, className }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`h-11 w-11 items-center justify-center rounded-md text-ink/40 hover:bg-berry/10 hover:text-berry disabled:opacity-40 md:justify-self-end ${className}`}
    >
      <CloseIcon className="h-4 w-4" />
    </button>
  );
}

// Row

type Props = {
  item: CourseItem;
  number: number;
  lang: string;
  sourceLabel: string;
  targetLabel: string;
  onSave: (itemId: string, changes: UpdateItemInput) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
};

type Status = "idle" | "saving" | "error";

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

export function ItemRow({ item, number, lang, sourceLabel, targetLabel, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(() => toDraft(item));
  const [status, setStatus] = useState<Status>("idle");
  const [expanded, setExpanded] = useState(() => item.alternates.length > 0 || Boolean(item.reading));
  const saved = useRef<ItemDraft>(toDraft(item));

  const set = (key: keyof ItemDraft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

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

  const onRowBlur = (e: FocusEvent<HTMLLIElement>) => {
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

  const deleteLabel = `Delete word ${number}`;

  return (
    <li onBlur={onRowBlur} className={`flex flex-col gap-2 px-3 py-3 md:px-2 md:py-1 ${ROW_GRID}`}>
      <div className="flex items-center justify-between md:contents">
        <span className="text-sm font-bold tabular-nums md:px-1">
          {status === "error" ? (
            <span className="text-berry" title="Not saved. Edit the word to retry.">
              Not saved
            </span>
          ) : (
            <span className={status === "saving" ? "text-water" : "text-ink/40"}>{number}</span>
          )}
        </span>
        <DeleteButton label={deleteLabel} disabled={status === "saving"} onClick={remove} className="flex md:hidden" />
      </div>

      <Field label={sourceLabel} value={draft.prompt} onChange={set("prompt")} onKeyDown={blurOnEnter} />
      <Field
        label={targetLabel}
        value={draft.answer}
        onChange={set("answer")}
        onKeyDown={blurOnEnter}
        lang={lang}
        weight="bold"
      />

      <div className={`${expanded ? "flex" : "hidden"} flex-col gap-2 md:contents`}>
        <Field
          label="Also accepted"
          value={draft.alternates}
          onChange={set("alternates")}
          onKeyDown={blurOnEnter}
          lang={lang}
          placeholder="Comma separated"
          weight="muted"
        />
        <Field
          label="Reading"
          value={draft.reading}
          onChange={set("reading")}
          onKeyDown={blurOnEnter}
          lang={lang}
          weight="muted"
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

      <DeleteButton label={deleteLabel} disabled={status === "saving"} onClick={remove} className="hidden md:flex" />
    </li>
  );
}