import "server-only";
import { HttpError } from "@/lib/api";
import { languageName } from "@/lib/client/languages";
import { createItems, getLevelLanguages } from "@/lib/services/courses";
import {
  ItemInput,
  type ImportExtractionInput,
  type StartExtractionInput,
  type UpdateDraftInput,
} from "@/lib/validation";

// Types

export type ExtractionStatus = "queued" | "running" | "done" | "failed" | "discarded";
export type DraftStatus = "pending" | "kept" | "deleted" | "imported";

export interface Draft {
  id: string;
  position: number;
  lemma: string;
  pos: string;
  prompt: string;
  answer: string;
  alternates: string[];
  notes: string | null;
  status: DraftStatus;
  edited: boolean;
}

export interface Extraction {
  id: string;
  status: ExtractionStatus;
  sourceUrl: string | null;
  error: string | null;
  cacheHit: boolean;
  knownDropped: number;
  items: Draft[];
}

interface RawExtraction {
  id: string;
  status: ExtractionStatus;
  source_url: string | null;
  error: string | null;
  cache_hit: boolean;
  known_dropped: number;
  items: Draft[];
}

// Constants

const DEFAULT_URL = "http://127.0.0.1:8000";
const TIMEOUT_MS = 60_000;

// Transport

function config(): { baseUrl: string; token: string } {
  const token = process.env.CURATOR_TOKEN;
  if (!token) throw new HttpError(503, "Importing from articles is not set up");
  return { baseUrl: process.env.CURATOR_URL ?? DEFAULT_URL, token };
}

async function curator<T>(
  path: string,
  options: { method?: string; body?: unknown; userId?: string } = {},
): Promise<T> {
  const { baseUrl, token } = config();
  const url = new URL(path, baseUrl);
  if (options.userId) url.searchParams.set("user_id", options.userId);

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: { "content-type": "application/json", "x-curator-token": token },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("curator unreachable", err);
    throw new HttpError(503, "The article importer is not running");
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof payload?.detail === "string" ? payload.detail : null;
    if (res.status === 404 || res.status === 409) throw new HttpError(res.status, detail ?? "Not found");
    if (res.status === 422) throw new HttpError(422, detail ?? "That request could not be processed");
    console.error("curator error", res.status, payload);
    throw new HttpError(502, "The article importer had a problem");
  }
  return (await res.json()) as T;
}

function toExtraction(raw: RawExtraction): Extraction {
  return {
    id: raw.id,
    status: raw.status,
    sourceUrl: raw.source_url,
    error: raw.error,
    cacheHit: raw.cache_hit,
    knownDropped: raw.known_dropped,
    items: raw.items,
  };
}

// Extractions

export async function startExtraction(userId: string, levelId: string, input: StartExtractionInput) {
  const { sourceLang, targetLang } = await getLevelLanguages(userId, levelId);
  const raw = await curator<RawExtraction>("/jobs", {
    method: "POST",
    body: {
      user_id: userId,
      url: input.url ?? null,
      text: input.text ?? null,
      lang: targetLang,
      source_language: languageName(sourceLang),
      target_language: languageName(targetLang),
    },
  });
  return toExtraction(raw);
}

export async function getExtraction(userId: string, extractionId: string) {
  return toExtraction(await curator<RawExtraction>(`/jobs/${extractionId}`, { userId }));
}

export async function updateDraft(userId: string, extractionId: string, draftId: string, input: UpdateDraftInput) {
  return curator<Draft>(`/jobs/${extractionId}/items/${draftId}`, { method: "PATCH", body: input, userId });
}

export async function discardExtraction(userId: string, extractionId: string) {
  return toExtraction(
    await curator<RawExtraction>(`/jobs/${extractionId}/discard`, { method: "POST", userId }),
  );
}

// Importing

export async function importExtraction(userId: string, extractionId: string, input: ImportExtractionInput) {
  const extraction = await getExtraction(userId, extractionId);
  if (extraction.status !== "done") throw new HttpError(409, "This extraction is not ready to import");

  const wanted = new Set(input.draftIds);
  const drafts = extraction.items.filter((d) => wanted.has(d.id) && d.status === "pending");
  if (drafts.length === 0) throw new HttpError(400, "Choose at least one word to add");

  const parsed = ItemInput.array().safeParse(
    drafts.map((d) => ({ prompt: d.prompt, answer: d.answer, alternates: d.alternates, notes: d.notes })),
  );
  if (!parsed.success) throw new HttpError(400, "Some words are empty or too long. Edit them first.");

  const created = await createItems(userId, input.levelId, parsed.data);
  const ordered = [...created].sort((a, b) => a.position - b.position);
  const imported = drafts.flatMap((d, i) => {
    const item = ordered[i];
    return item ? [{ draft_id: d.id, item_id: item.id }] : [];
  });

  try {
    await curator(`/jobs/${extractionId}/imported`, { method: "POST", userId, body: { items: imported } });
  } catch (err) {
    console.error("could not mark drafts as imported", err);
  }

  return ordered;
}
