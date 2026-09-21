"use client";

import { useState, type KeyboardEvent } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { CourseLevel, ItemInput, UpdateItemInput } from "@/lib/client/types";
import { AddItemRow } from "./AddItemRow";
import { ImportDialog } from "./ImportDialog";
import { ItemRow, ROW_GRID } from "./ItemRow";

type Props = {
  level: CourseLevel;
  number: number;
  sourceLabel: string;
  targetLabel: string;
  lang: string;
  onRename: (title: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onCreateItem: (input: ItemInput) => Promise<void>;
  onUpdateItem: (itemId: string, changes: UpdateItemInput) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onImport: (items: ItemInput[], onProgress: (done: number) => void) => Promise<void>;
};

export function LevelPanel({
  level,
  number,
  sourceLabel,
  targetLabel,
  lang,
  onRename,
  onDelete,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onImport,
}: Props) {
  const [title, setTitle] = useState(level.title);
  const [importing, setImporting] = useState(false);
  const count = level.items.length;

  const saveTitle = async () => {
    const next = title.trim();
    if (!next) {
      setTitle(level.title);
      return;
    }
    if (next === level.title) return;
    const ok = await onRename(next);
    if (!ok) setTitle(level.title);
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-ink/10 bg-white">
      <header className="flex flex-col gap-2 border-b border-ink/10 bg-ink/[0.03] px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sm font-bold text-ink/50">Level {number}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={onTitleKey}
            maxLength={120}
            aria-label={`Level ${number} title`}
            className="min-h-11 min-w-0 flex-1 rounded-md border-2 border-ink/10 bg-white px-2 py-1 text-lg font-extrabold outline-none focus:border-water sm:border-transparent sm:bg-transparent sm:hover:border-ink/10 sm:focus:bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-auto text-sm text-ink/50 sm:mr-1">
            {count} {count === 1 ? "word" : "words"}
          </span>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="min-h-11 rounded-lg border border-ink/20 bg-white px-4 text-sm font-bold hover:border-water hover:text-water"
          >
            Import CSV
          </button>
          <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={onDelete} />
        </div>
      </header>

      {importing ? (
        <ImportDialog
          levelNumber={number}
          levelTitle={level.title}
          existing={level.items}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          lang={lang}
          onImport={onImport}
          onClose={() => setImporting(false)}
        />
      ) : null}

      <div aria-hidden="true" className={`hidden px-2 py-2 text-xs font-bold text-ink/50 ${ROW_GRID}`}>
        <span className="px-1">#</span>
        <span className="px-2">{sourceLabel}</span>
        <span className="px-2">{targetLabel}</span>
        <span className="px-2">Also accepted</span>
        <span className="px-2">Reading</span>
        <span />
      </div>

      <ul className="divide-y divide-ink/5 md:divide-y-0">
        {level.items.map((item, i) => (
          <ItemRow
            key={item.id}
            item={item}
            number={i + 1}
            lang={lang}
            sourceLabel={sourceLabel}
            targetLabel={targetLabel}
            onSave={onUpdateItem}
            onDelete={onDeleteItem}
          />
        ))}
        <AddItemRow lang={lang} sourceLabel={sourceLabel} targetLabel={targetLabel} onCreate={onCreateItem} />
      </ul>
    </section>
  );
}