"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client/api";
import { describePlan, levelSlots, planLevelFill, slotLevelNumber } from "@/lib/client/levels";
import type { CourseItem, CourseLevel, Draft, Extraction, UpdateDraftInput } from "@/lib/client/types";

// Types

type Props = {
  levelId: string;
  levelNumber: number;
  levelTitle: string;
  existing: CourseItem[];
  sourceLabel: string;
  targetLabel: string;
  lang: string;
  wordsPerLevel: number;
  levelCount: number;
  onImported: (levels: CourseLevel[]) => void;
  onClose: () => void;
};

type Mode = "url" | "text";

// Constants

const POLL_MS = 2500;
const MAX_TEXT = 120_000;

const INPUT =
  "min-h-11 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-1.5 text-base outline-none focus:border-water sm:text-sm";

// Helpers

function answerKey(answer: string): string {
  return answer.normalize("NFC").trim().toLowerCase();
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function splitAlternates(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Draft row

type DraftRowProps = {
  draft: Draft;
  selected: boolean;
  duplicate: boolean;
  levelNumber: number | null;
  lang: string;
  sourceLabel: string;
  targetLabel: string;
  onToggle: () => void;
  onSave: (changes: UpdateDraftInput) => Promise<boolean>;
  onRemove: () => void;
};

function DraftRow({
  draft,
  selected,
  duplicate,
  levelNumber,
  lang,
  sourceLabel,
  targetLabel,
  onToggle,
  onSave,
  onRemove,
}: DraftRowProps) {
  const [prompt, setPrompt] = useState(draft.prompt);
  const [answer, setAnswer] = useState(draft.answer);
  const [alternates, setAlternates] = useState(draft.alternates.join(", "));

  const save = async () => {
    const changes: UpdateDraftInput = {};
    const nextPrompt = prompt.trim();
    const nextAnswer = answer.trim();
    const nextAlternates = splitAlternates(alternates);
    if (!nextPrompt || !nextAnswer) {
      setPrompt(draft.prompt);
      setAnswer(draft.answer);
      return;
    }
    if (nextPrompt !== draft.prompt) changes.prompt = nextPrompt;
    if (nextAnswer !== draft.answer) changes.answer = nextAnswer;
    if (nextAlternates.join("\u0000") !== draft.alternates.join("\u0000")) changes.alternates = nextAlternates;
    if (Object.keys(changes).length === 0) return;
    const ok = await onSave(changes);
    if (!ok) {
      setPrompt(draft.prompt);
      setAnswer(draft.answer);
      setAlternates(draft.alternates.join(", "));
    }
  };

  return (
    <li className={`px-3 py-3 sm:px-4 ${selected ? "" : "bg-ink/[0.03]"}`}>
      <div className="flex items-start gap-3">
        <label className="flex min-h-11 shrink-0 items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Add ${draft.answer}`}
            className="h-5 w-5 accent-water"
          />
        </label>
        <div className={`grid min-w-0 flex-1 gap-2 sm:grid-cols-3 ${selected ? "" : "opacity-60"}`}>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onBlur={save}
            lang={lang}
            dir="auto"
            aria-label={targetLabel}
            maxLength={500}
            className={`${INPUT} font-bold`}
          />
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={save}
            dir="auto"
            aria-label={sourceLabel}
            maxLength={500}
            className={INPUT}
          />
          <input
            value={alternates}
            onChange={(e) => setAlternates(e.target.value)}
            onBlur={save}
            lang={lang}
            dir="auto"
            aria-label="Also accepted"
            placeholder="Also accepted"
            className={`${INPUT} text-ink/70`}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${draft.answer}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-berry/10 hover:text-berry"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      {draft.notes || draft.reading || duplicate || levelNumber !== null ? (
        <p className="mt-1 pl-8 text-sm text-ink/50">
          {levelNumber !== null ? (
            <span className="mr-2 rounded bg-water/10 px-1.5 py-0.5 text-xs font-bold text-water">
              Level {levelNumber}
            </span>
          ) : null}
          {duplicate ? <span className="mr-2 font-bold text-ink/60">Already in this level.</span> : null}
          {draft.reading ? (
            <span lang={lang} className="mr-2 font-semibold text-ink/70">
              {draft.reading}
            </span>
          ) : null}
          {draft.notes ? (
            <span lang={lang} dir="auto" className="italic">
              {draft.notes}
            </span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

// Component

export function ArticleImportDialog({
  levelId,
  levelNumber,
  levelTitle,
  existing,
  sourceLabel,
  targetLabel,
  lang,
  wordsPerLevel,
  levelCount,
  onImported,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const existingAnswers = useMemo(() => new Set(existing.map((i) => answerKey(i.answer))), [existing]);
  const status = extraction?.status;
  const working = status === "queued" || status === "running";
  const reviewing = status === "done";
  const chosen = drafts.filter((d) => selected.has(d.id));
  const canSubmit =
    !busy && (mode === "url" ? url.trim().length > 0 : text.trim().length > 0 && text.length <= MAX_TEXT);
  const canImport = reviewing && !busy && saving === 0 && chosen.length > 0;
  const plan = useMemo(
    () => planLevelFill(existing.length, chosen.length, wordsPerLevel),
    [existing.length, chosen.length, wordsPerLevel],
  );
  const targetLevels = useMemo(() => {
    const slots = levelSlots(plan);
    return new Map(chosen.map((d, i) => [d.id, slotLevelNumber(slots[i] ?? 0, levelNumber, levelCount)]));
  }, [chosen, plan, levelNumber, levelCount]);

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

  // Polling

  useEffect(() => {
    if (!extraction || !working) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await api.extraction(extraction.id);
        if (cancelled) return;
        setExtraction(next);
        if (next.status === "done") {
          const pending = next.items.filter((d) => d.status === "pending");
          setDrafts(pending);
          setSelected(new Set(pending.filter((d) => !existingAnswers.has(answerKey(d.answer))).map((d) => d.id)));
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Lost track of the import. Try again."));
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [extraction, working, existingAnswers]);

  // Starting

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = mode === "url" ? { url: url.trim() } : { text: text.trim() };
      setExtraction(await api.startExtraction(levelId, body));
    } catch (err) {
      setError(errorMessage(err, "Could not start the import."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const restart = () => {
    setExtraction(null);
    setDrafts([]);
    setSelected(new Set());
    setError(null);
  };

  // Reviewing

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(drafts.map((d) => d.id)));
  const selectNone = () => setSelected(new Set());

  const saveDraft = async (draftId: string, changes: UpdateDraftInput): Promise<boolean> => {
    if (!extraction) return false;
    setSaving((n) => n + 1);
    setError(null);
    try {
      const updated = await api.updateDraft(extraction.id, draftId, changes);
      setDrafts((ds) => ds.map((d) => (d.id === draftId ? updated : d)));
      return true;
    } catch (err) {
      setError(errorMessage(err, "Could not save that change."));
      return false;
    } finally {
      setSaving((n) => n - 1);
    }
  };

  const removeDraft = async (draftId: string) => {
    if (!extraction) return;
    const removed = drafts.find((d) => d.id === draftId);
    setDrafts((ds) => ds.filter((d) => d.id !== draftId));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(draftId);
      return next;
    });
    try {
      await api.updateDraft(extraction.id, draftId, { status: "deleted" });
    } catch (err) {
      setError(errorMessage(err, "Could not remove that word."));
      if (removed) setDrafts((ds) => [...ds, removed].sort((a, b) => a.position - b.position));
    }
  };

  // Finishing

  const close = () => {
    if (busy) return;
    if (extraction && reviewing) api.discardExtraction(extraction.id).catch(() => undefined);
    onClose();
  };

  const importChosen = async () => {
    if (!extraction || !canImport || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const levels = await api.importExtraction(
        extraction.id,
        levelId,
        chosen.map((d) => d.id),
      );
      onImported(levels);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "The words could not be added."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="article-import-title"
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col bg-paper p-0 text-ink backdrop:bg-ink/60 open:flex sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(56rem,calc(100vw-2rem))] sm:rounded-xl sm:shadow-2xl"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-ink/10 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-4">
        <div className="min-w-0 flex-1">
          <h2 id="article-import-title" className="text-xl font-extrabold">
            Words from an article
          </h2>
          <p className="truncate text-sm text-ink/60">
            Starting in Level {levelNumber}: {levelTitle} · {wordsPerLevel} words per level
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
        {!extraction ? (
          <form id="article-source" onSubmit={start} className="flex flex-col gap-3">
            <p className="text-sm text-ink/60">
              Paste a link to a {targetLabel} article, or the text itself. You will be able to check and edit every word
              before it is added.
            </p>
            <div role="tablist" className="flex gap-2">
              {(["url", "text"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`min-h-11 rounded-lg px-4 text-sm font-bold ${
                    mode === m ? "bg-ink text-white" : "border border-ink/20 bg-white hover:border-water"
                  }`}
                >
                  {m === "url" ? "Link" : "Text"}
                </button>
              ))}
            </div>
            {mode === "url" ? (
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                aria-label="Article link"
                autoComplete="off"
                className={INPUT}
              />
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                lang={lang}
                aria-label="Article text"
                className={`${INPUT} py-2`}
              />
            )}
            {mode === "text" && text.length > MAX_TEXT ? (
              <p className="text-sm font-semibold text-berry">That text is too long. Paste a shorter part.</p>
            ) : null}
          </form>
        ) : null}

        {working ? (
          <div aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-ink/10 border-t-water" />
            <p className="font-bold">Reading the article and choosing words</p>
            <p className="text-sm text-ink/60">This usually takes under a minute.</p>
          </div>
        ) : null}

        {status === "failed" ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="rounded-lg bg-berry/10 px-4 py-3 text-sm font-semibold text-berry">
              {extraction?.error ?? "The words could not be extracted."}
            </p>
            <button type="button" onClick={restart} className="min-h-11 text-sm font-bold text-water hover:underline">
              Try again
            </button>
          </div>
        ) : null}

        {reviewing ? (
          <section className="flex flex-col gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="font-bold">
                  {plural(drafts.length, "word", "words")} found. {chosen.length} selected.
                </p>
                <div className="flex gap-3 text-sm font-bold text-water">
                  <button type="button" onClick={selectAll} className="min-h-11 hover:underline">
                    Select all
                  </button>
                  <button type="button" onClick={selectNone} className="min-h-11 hover:underline">
                    Select none
                  </button>
                </div>
              </div>
              {chosen.length > 0 ? (
                <p className="text-sm text-ink/70">{describePlan(plan, levelNumber, levelCount)}</p>
              ) : null}
              <p className="text-sm text-ink/60">Most common words come first.</p>
              {extraction?.knownDropped ? (
                <p className="text-sm text-ink/60">
                  Left out {plural(extraction.knownDropped, "word", "words")} you are already learning.
                </p>
              ) : null}
              <p className="mt-1 text-sm text-ink/60">Edit anything that looks wrong. Changes save as you go.</p>
            </div>
            {drafts.length > 0 ? (
              <ul className="divide-y divide-ink/5 rounded-lg border border-ink/10 bg-white">
                {drafts.map((d) => (
                  <DraftRow
                    key={d.id}
                    draft={d}
                    selected={selected.has(d.id)}
                    duplicate={existingAnswers.has(answerKey(d.answer))}
                    levelNumber={targetLevels.get(d.id) ?? null}
                    lang={lang}
                    sourceLabel={sourceLabel}
                    targetLabel={targetLabel}
                    onToggle={() => toggle(d.id)}
                    onSave={(changes) => saveDraft(d.id, changes)}
                    onRemove={() => removeDraft(d.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink/60">No new words were found in that article.</p>
            )}
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-berry/10 px-4 py-3 text-sm font-semibold text-berry">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-ink/10 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-5 sm:py-4">
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="order-3 min-h-12 rounded-lg border border-ink/20 px-4 font-bold disabled:opacity-40 sm:order-none sm:min-h-11"
        >
          Cancel
        </button>
        {!extraction ? (
          <button
            type="submit"
            form="article-source"
            disabled={!canSubmit}
            className="order-2 min-h-12 rounded-lg bg-water px-5 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] disabled:bg-ink/20 disabled:shadow-none sm:order-none sm:min-h-11"
          >
            {busy ? "Starting" : "Find words"}
          </button>
        ) : null}
        {reviewing ? (
          <button
            type="button"
            onClick={importChosen}
            disabled={!canImport}
            className="order-2 min-h-12 rounded-lg bg-leaf px-5 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-leaf-dark disabled:bg-ink/20 disabled:shadow-none sm:order-none sm:min-h-11"
          >
            {busy ? "Adding" : `Add ${plural(chosen.length, "word", "words")}`}
          </button>
        ) : null}
      </div>
    </dialog>
  );
}
