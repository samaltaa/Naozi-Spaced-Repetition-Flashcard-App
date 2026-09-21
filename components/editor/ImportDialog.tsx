"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { errorMessage } from "@/lib/client/api";
import {
  buildImport,
  columnCount,
  EMPTY_MAPPING,
  guessHasHeader,
  guessMapping,
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
  "min-h-11 w-full rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-base font-semibold outline-none focus:border-water";

const REQUIRED_FIELDS: ImportField[] = ["prompt", "answer"];
const OPTIONAL_FIELDS: ImportField[] = ["alternates", "reading", "notes"];

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
  const [showOptional, setShowOptional] = useState(false);

  const labels = useMemo(() => ({ source: sourceLabel, target: targetLabel }), [sourceLabel, targetLabel]);
  const rows = useMemo(() => parseCsv(text), [text]);
  const columns = columnCount(rows);
  const plan = useMemo(() => buildImport(rows, mapping, hasHeader, existing), [rows, mapping, hasHeader, existing]);
  const sameColumn = mapping.prompt !== null && mapping.prompt === mapping.answer;
  const canImport = !busy && !sameColumn && plan.items.length > 0;
  const optionalMapped = OPTIONAL_FIELDS.some((field) => mapping[field] !== null);
  const optionalVisible = showOptional || optionalMapped;

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
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
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

  const fieldSelect = (field: ImportField): ReactNode => (
    <label key={field} className="text-sm">
      <span className="mb-1 block font-bold">
        {fieldLabels[field]}
        {REQUIRED_FIELDS.includes(field) ? null : <span className="font-normal text-ink/50"> (optional)</span>}
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
  );

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
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col bg-paper p-0 text-ink backdrop:bg-ink/60 open:flex sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(56rem,calc(100vw-2rem))] sm:rounded-xl sm:shadow-2xl"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-ink/10 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-4">
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
        <section>
          <h3 className="text-sm font-bold">1. Add your list</h3>
          <p className="mt-1 text-sm text-ink/60">
            A CSV or tab-separated file from a spreadsheet, Anki or an old Memrise export. One word per row.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-ink-soft">
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
            className="mt-3 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 font-mono text-base outline-none focus:border-water sm:text-sm"
          />
        </section>

        {rows.length > 0 ? (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold">2. Match the columns</h3>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="h-5 w-5 accent-water"
                />
                First row is a header
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">{REQUIRED_FIELDS.map(fieldSelect)}</div>
            <div className="mt-1 flex flex-wrap gap-x-4">
              <button
                type="button"
                onClick={swap}
                className="inline-flex min-h-11 items-center text-sm font-bold text-water hover:underline"
              >
                Swap {sourceLabel} and {targetLabel}
              </button>
              {optionalVisible ? null : (
                <button
                  type="button"
                  onClick={() => setShowOptional(true)}
                  className="inline-flex min-h-11 items-center text-sm font-bold text-water hover:underline"
                >
                  More columns
                </button>
              )}
            </div>
            {optionalVisible ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-3">{OPTIONAL_FIELDS.map(fieldSelect)}</div>
            ) : null}
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
              <>
                <ul className="mt-3 divide-y divide-ink/5 rounded-lg border border-ink/10 bg-white sm:hidden">
                  {plan.items.slice(0, PREVIEW_ROWS).map((item, i) => (
                    <li key={i} className="px-3 py-2">
                      <p dir="auto" className="break-words text-sm text-ink/70">
                        {item.prompt}
                      </p>
                      <p dir="auto" lang={lang} className="break-words font-bold">
                        {item.answer}
                        {item.reading ? (
                          <span className="ml-2 text-sm font-normal text-ink/50">{item.reading}</span>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 hidden overflow-x-auto rounded-lg border border-ink/10 bg-white sm:block">
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
              </>
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

      <div className="flex shrink-0 flex-col gap-2 border-t border-ink/10 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5 sm:py-4">
        {busy ? (
          <p className="order-first text-sm font-semibold text-ink/60 sm:order-none sm:mr-auto" aria-live="polite">
            Added {progress} of {plan.items.length}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="order-3 min-h-12 rounded-lg border border-ink/20 px-4 font-bold disabled:opacity-40 sm:order-none sm:min-h-11"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canImport}
          className="order-2 min-h-12 rounded-lg bg-leaf px-5 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-leaf-dark disabled:bg-ink/20 disabled:shadow-none sm:order-none sm:min-h-11"
        >
          {busy ? "Adding" : `Add ${plural(plan.items.length, "word", "words")}`}
        </button>
      </div>
    </dialog>
  );
}