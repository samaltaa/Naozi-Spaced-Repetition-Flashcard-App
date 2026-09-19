"use client";

import { useState, type FormEvent } from "react";

type Props = {
  nextNumber: number;
  onAdd: (title: string) => Promise<boolean>;
};

export function AddLevelForm({ nextNumber, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const added = await onAdd(title.trim() || `Level ${nextNumber}`);
      if (added) setTitle("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex gap-2 rounded-xl border-2 border-dashed border-ink/20 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder={`Level ${nextNumber} title`}
        aria-label="New level title"
        className="min-w-0 flex-1 rounded-lg border-2 border-ink/15 bg-white px-3 py-2 font-semibold outline-none focus:border-water"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-ink px-4 py-2 font-bold text-white hover:bg-ink-soft disabled:opacity-50"
      >
        Add level
      </button>
    </form>
  );
}