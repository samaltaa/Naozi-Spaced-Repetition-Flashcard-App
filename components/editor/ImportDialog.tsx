"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { errorMessage } from "@/lib/client/api";
import {
  buildImport,
  columnCount,
  EMPTY_MAPPING,
  guessHasHeader,
  guessMapping,
  IMPORT_FIELDS,
  parseCsv,
  type ColumnMapping,
  type ImportField,
} from "@/lib/client/csv";
import type { CourseItem, ItemInput } from "@/lib/client/types";

// Types

type Props = {
  levelNumber: number;
  levelTitle: string;
  existing: CourseItem[];
  sourceLabel: string;
  targetLabel: string;
  lang: string;
  onImport: (items: ItemInput[], onProgress: (done: number) => void) => Promise<void>;
  onClose: () => void;
};

// Constants

const MAX_FILE_BYTES = 2_000_000;
const PREVIEW_ROWS = 8;
const NOT_USED = "none";

const SELECT =
  "w-full rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-sm font-semibold outline-none focus:border-water";

// Helpers

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Component

export function ImportDialog({
  levelNumber,
  levelTitle,
  existing,
  sourceLabel,
  targetLabel,
  lang,
  onImport,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const labels = useMemo(() => ({ source: sourceLabel, target: targetLabel }), [sourceLabel, targetLabel]);
  const rows = useMemo(() => parseCsv(text), [text]);
  const columns = columnCount(rows);
  const plan = useMemo(() => buildImport(rows, mapping, hasHeader, existing), [rows, mapping, hasHeader, existing]);
  const sameColumn = mapping.prompt !== null && mapping.prompt === mapping.answer;
  const canImport = !busy && !sameColumn && plan.items.length > 0;

  const fieldLabels: Record<ImportField, string> = {
    prompt: sourceLabel,
    answer: targetLabel,
    alternates: "Also accepted",
    reading: "Reading",
    notes: "Notes",
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Loading

  const loadText = (next: string, force: boolean) => {
    const nextRows = parseCsv(next);
    setText(next);
    setError(null);
    if (force || columnCount(nextRows) !== columns) {
      const header = guessHasHeader(nextRows, labels);
      setHasHeader(header);
      setMapping(guessMapping(nextRows, header, labels));
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is over 2 MB. Split it into smaller files and import them one at a time.");
      return;
    }
    setFileName(file.name);
    loadText(await file.text(), true);
  };

  // Mapping

  const columnLabel = (index: number): string => {
    const header = hasHeader ? rows[0]?.[index] : undefined;
    if (header) return truncate(header, 28);
    const sample = rows[hasHeader ? 1 : 0]?.[index] ?? "";
    return sample ? `Column ${index + 1}: ${truncate(sample, 20)}` : `Column ${index + 1}`;
  };

  const setField = (field: ImportField, value: string) => {
    setMapping((m) => ({ ...m, [field]: value === NOT_USED ? null : Number(value) }));
  };

  const swap = () => setMapping((m) => ({ ...m, prompt: m.answer, answer: m.prompt }));

  // Import

  const submit = async () => {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      await onImport(plan.items, setProgress);
      onClose();
    } catch (err) {
      setError(
        `${errorMessage(err, "The import stopped.")} Words added before the error were kept. Press Add again to import the rest.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const skipped = plan.missing + plan.duplicate + plan.tooLong;
  const skipReasons = [
    plan.missing > 0 ? `${plan.missing} missing a word or translation` : null,
    plan.duplicate > 0 ? `${plan.duplicate} already in this level` : null,
    plan.tooLong > 0 ? `${plan.tooLong} too long` : null,
  ].filter(Boolean);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      aria-labelledby="import-title"
      className="m-auto max-h-[calc(100vh-2rem)] w-[min(56rem,calc(100vw-2rem))] rounded-xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/60"
    >
      <div className="flex items-center gap-3 border-b border-ink/10 bg-white px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="import-title" className="text-xl font-extrabold">
            Import words
          </h2>
          <p className="truncate text-sm text-ink/60">
            Into Level {levelNumber}: {levelTitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="rounded-full p-2 text-ink/50 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-6 px-5 py-5">
        <section>
          <h3 className="text-sm font-bold">1. Add your list</h3>
          <p className="mt-1 text-sm text-ink/60">
            A CSV or tab-separated file from a spreadsheet, Anki or an old Memrise export. One word per row.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-ink-soft">
              Choose file
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} className="sr-only" />
            </label>
            <span className="text-sm text-ink/60">{fileName ?? "or paste rows below"}</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setFileName(null);
              loadText(e.target.value, false);
            }}
            rows={5}
            spellCheck={false}
            placeholder={"house, casa\ndog, perro\nto eat, comer"}
            aria-label="Paste rows"
            className="mt-3 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-water"
          />
        </section>

        {rows.length > 0 ? (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold">2. Match the columns</h3>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="h-4 w-4 accent-water"
                />
                First row is a header
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-5">
              {IMPORT_FIELDS.map((field) => (
                <label key={field} className="text-sm">
                  <span className="mb-1 block font-bold">
                    {fieldLabels[field]}
                    {field === "prompt" || field === "answer" ? null : (
                      <span className="font-normal text-ink/50"> (optional)</span>
                    )}
                  </span>
                  <select
                    value={mapping[field] === null ? NOT_USED : String(mapping[field])}
                    onChange={(e) => setField(field, e.target.value)}
                    className={SELECT}
                  >
                    <option value={NOT_USED}>Not used</option>
                    {Array.from({ length: columns }, (_, i) => (
                      <option key={i} value={i}>
                        {columnLabel(i)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={swap}
              className="mt-3 text-sm font-bold text-water hover:underline"
            >
              Swap {sourceLabel} and {targetLabel}
            </button>
            {sameColumn ? (
              <p role="alert" className="mt-2 text-sm font-semibold text-berry">
                {sourceLabel} and {targetLabel} need different columns.
              </p>
            ) : null}
          </section>
        ) : null}

        {rows.length > 0 && !sameColumn ? (
          <section>
            <h3 className="text-sm font-bold">3. Check the preview</h3>
            {plan.items.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-ink/10 bg-white">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-ink/50">
                      <th className="px-3 py-2">{sourceLabel}</th>
                      <th className="px-3 py-2">{targetLabel}</th>
                      <th className="px-3 py-2">Also accepted</th>
                      <th className="px-3 py-2">Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.slice(0, PREVIEW_ROWS).map((item, i) => (
                      <tr key={i} className="border-t border-ink/5">
                        <td dir="auto" className="px-3 py-2">
                          {item.prompt}
                        </td>
                        <td dir="auto" lang={lang} className="px-3 py-2 font-bold">
                          {item.answer}
                        </td>
                        <td dir="auto" lang={lang} className="px-3 py-2 text-ink/70">
                          {item.alternates?.join(", ")}
                        </td>
                        <td dir="auto" lang={lang} className="px-3 py-2 text-ink/70">
                          {item.reading}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="mt-3 text-sm">
              <span className="font-bold">{plural(plan.items.length, "word", "words")} ready to add.</span>
              {plan.items.length > PREVIEW_ROWS ? (
                <span className="text-ink/60"> Showing the first {PREVIEW_ROWS}.</span>
              ) : null}
            </p>
            {skipped > 0 ? (
              <p className="mt-1 text-sm text-ink/60">
                Skipping {plural(skipped, "row", "rows")}: {skipReasons.join(", ")}.
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-berry/10 px-4 py-3 text-sm font-semibold text-berry">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-ink/10 bg-white px-5 py-4">
        {busy ? (
          <p className="mr-auto text-sm font-semibold text-ink/60" aria-live="polite">
            Added {progress} of {plan.items.length}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-ink/20 px-4 py-2 font-bold disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canImport}
          className="rounded-lg bg-leaf px-5 py-2 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-leaf-dark disabled:bg-ink/20 disabled:shadow-none"
        >
          {busy ? "Adding" : `Add ${plural(plan.items.length, "word", "words")}`}
        </button>
      </div>
    </dialog>
  );
}