import Papa from "papaparse";
import type { CourseItem, ItemInput } from "./types";

// Types

export type ImportField = "prompt" | "answer" | "alternates" | "reading" | "notes";
export type ColumnMapping = Record<ImportField, number | null>;

export interface ImportLabels {
  source: string;
  target: string;
}

export interface ImportPlan {
  items: ItemInput[];
  missing: number;
  duplicate: number;
  tooLong: number;
}

// Constants

export const IMPORT_FIELDS: ImportField[] = ["prompt", "answer", "alternates", "reading", "notes"];

export const EMPTY_MAPPING: ColumnMapping = {
  prompt: null,
  answer: null,
  alternates: null,
  reading: null,
  notes: null,
};

const LIMITS = {
  prompt: 500,
  answer: 500,
  reading: 200,
  notes: 2000,
  alternate: 500,
  alternates: 20,
};

const HEADER_PATTERNS: Record<ImportField, RegExp> = {
  prompt: /^(prompt|front|question|definition|meaning|english|source)$/i,
  answer: /^(answer|back|word|term|target|expression)$/i,
  alternates: /(alternat|also|accepted|variant|synonym)/i,
  reading: /(reading|pronunciation|romani[sz]|pinyin|kana|furigana|translit)/i,
  notes: /(note|comment|example|hint|part of speech)/i,
};

// Parsing

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  if (!clean.trim()) return [];
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  return result.data
    .map((row) => row.map((cell) => (cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
}

export function columnCount(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

// Guessing

function matchesField(field: ImportField, name: string, labels: ImportLabels): boolean {
  const lower = name.toLowerCase();
  if (field === "prompt" && lower === labels.source.toLowerCase()) return true;
  if (field === "answer" && lower === labels.target.toLowerCase()) return true;
  return HEADER_PATTERNS[field].test(name);
}

export function guessHasHeader(rows: string[][], labels: ImportLabels): boolean {
  const first = rows[0];
  if (!first) return false;
  return first.some((cell) => IMPORT_FIELDS.some((field) => matchesField(field, cell, labels)));
}

export function guessMapping(rows: string[][], hasHeader: boolean, labels: ImportLabels): ColumnMapping {
  const count = columnCount(rows);
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();

  if (hasHeader && rows[0]) {
    rows[0].forEach((cell, index) => {
      for (const field of IMPORT_FIELDS) {
        if (mapping[field] !== null || used.has(index)) continue;
        if (matchesField(field, cell, labels)) {
          mapping[field] = index;
          used.add(index);
          break;
        }
      }
    });
  }

  const nextFree = (): number | null => {
    for (let i = 0; i < count; i++) {
      if (!used.has(i)) {
        used.add(i);
        return i;
      }
    }
    return null;
  };

  if (mapping.prompt === null) mapping.prompt = nextFree();
  if (mapping.answer === null) mapping.answer = nextFree();
  return mapping;
}

// Planning

export function splitAlternates(cell: string): string[] {
  return cell
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pairKey(prompt: string, answer: string): string {
  return `${prompt.normalize("NFC").toLowerCase()}\u0000${answer.normalize("NFC").toLowerCase()}`;
}

export function buildImport(
  rows: string[][],
  mapping: ColumnMapping,
  hasHeader: boolean,
  existing: CourseItem[],
): ImportPlan {
  const plan: ImportPlan = { items: [], missing: 0, duplicate: 0, tooLong: 0 };
  if (mapping.prompt === null || mapping.answer === null) return plan;

  const seen = new Set(existing.map((item) => pairKey(item.prompt, item.answer)));
  const body = hasHeader ? rows.slice(1) : rows;
  const read = (row: string[], field: ImportField): string => {
    const index = mapping[field];
    return index === null ? "" : (row[index] ?? "").trim();
  };

  for (const row of body) {
    const prompt = read(row, "prompt");
    const answer = read(row, "answer");
    if (!prompt || !answer) {
      plan.missing++;
      continue;
    }

    const reading = read(row, "reading");
    const notes = read(row, "notes");
    if (
      prompt.length > LIMITS.prompt ||
      answer.length > LIMITS.answer ||
      reading.length > LIMITS.reading ||
      notes.length > LIMITS.notes
    ) {
      plan.tooLong++;
      continue;
    }

    const key = pairKey(prompt, answer);
    if (seen.has(key)) {
      plan.duplicate++;
      continue;
    }
    seen.add(key);

    const alternates = splitAlternates(read(row, "alternates"))
      .filter((alt) => alt.length <= LIMITS.alternate && alt !== answer)
      .slice(0, LIMITS.alternates);

    plan.items.push({
      prompt,
      answer,
      alternates,
      reading: reading || null,
      notes: notes || null,
    });
  }

  return plan;
}