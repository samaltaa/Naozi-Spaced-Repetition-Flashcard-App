"use client";

import { useState, type KeyboardEvent } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { CourseLevel, ItemInput, UpdateItemInput } from "@/lib/client/types";
import { AddItemRow } from "./AddItemRow";
import { ImportDialog } from "./ImportDialog";
import { ItemRow } from "./ItemRow";

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
      <header className="flex flex-wrap items-center gap-3 border-b border-ink/10 bg-ink/[0.03] px-4 py-3">
        <span className="text-sm font-bold text-ink/50">Level {number}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={onTitleKey}
          maxLength={120}
          aria-label={`Level ${number} title`}
          className="min-w-0 flex-1 rounded-md border-2 border-transparent bg-transparent px-2 py-1 text-lg font-extrabold outline-none hover:border-ink/10 focus:border-water focus:bg-white"
        />
        <span className="text-sm text-ink/50">
          {count} {count === 1 ? "word" : "words"}
        </span>
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm font-bold hover:border-water hover:text-water"
        >
          Import CSV
        </button>
        <ConfirmButton label="Delete level" confirmLabel="Delete level and its words" onConfirm={onDelete} />
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr className="text-xs font-bold text-ink/50">
              <th className="w-10 px-3 py-2">#</th>
              <th className="px-2 py-2">{sourceLabel}</th>
              <th className="px-2 py-2">{targetLabel}</th>
              <th className="px-2 py-2">Also accepted</th>
              <th className="px-2 py-2">Reading</th>
              <th className="w-20 px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {level.items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                number={i + 1}
                lang={lang}
                onSave={onUpdateItem}
                onDelete={onDeleteItem}
              />
            ))}
            <AddItemRow lang={lang} onCreate={onCreateItem} />
          </tbody>
        </table>
      </div>
    </section>
  );
}