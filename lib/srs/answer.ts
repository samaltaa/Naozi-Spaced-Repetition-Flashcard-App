import type { AnswerCheck, DiacriticMode } from "./types";

// Patterns

const PUNCTUATION = /\p{P}/gu;
const WHITESPACE = /\s+/gu;
const STRIPPABLE_MARKS = /([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Normalization

function lower(text: string, locale: string): string {
  try {
    return text.toLocaleLowerCase(locale);
  } catch {
    return text.toLowerCase();
  }
}

export function normalizeAnswer(text: string, locale: string): string {
  const cleaned = text.normalize("NFKC").replace(PUNCTUATION, " ").replace(WHITESPACE, " ").trim();
  return lower(cleaned, locale);
}

export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(STRIPPABLE_MARKS, "$1").normalize("NFC");
}

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

// Distance

export function levenshtein(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

export function maxTypos(length: number): number {
  if (length <= 3) return 0;
  if (length <= 9) return 1;
  return 2;
}

// Checking

export function checkChoice(selected: string, answer: string, locale: string): AnswerCheck {
  const correct = normalizeAnswer(selected, locale) === normalizeAnswer(answer, locale);
  return correct ? { verdict: "exact", matched: answer } : { verdict: "wrong", matched: null };
}

export function checkTyped(
  input: string,
  answers: readonly string[],
  options: { locale: string; diacriticMode: DiacriticMode },
): AnswerCheck {
  const typed = normalizeAnswer(input, options.locale);
  if (!typed) return { verdict: "wrong", matched: null };

  const lenient = options.diacriticMode === "lenient";
  const typedBare = stripDiacritics(typed);
  const candidates = answers.map((raw) => {
    const norm = normalizeAnswer(raw, options.locale);
    return { raw, norm, bare: stripDiacritics(norm) };
  });

  const exact = candidates.find((c) => c.norm === typed);
  if (exact) return { verdict: "exact", matched: exact.raw };

  const accentOnly = candidates.find((c) => c.bare === typedBare);
  if (accentOnly) {
    return lenient ? { verdict: "accents", matched: accentOnly.raw } : { verdict: "wrong", matched: null };
  }

  const typedChars = graphemes(lenient ? typedBare : typed);
  let best: { distance: number; raw: string } | null = null;
  for (const c of candidates) {
    const target = graphemes(lenient ? c.bare : c.norm);
    const distance = levenshtein(typedChars, target);
    if (distance <= maxTypos(target.length) && (!best || distance < best.distance)) {
      best = { distance, raw: c.raw };
    }
  }

  return best ? { verdict: "typo", matched: best.raw } : { verdict: "wrong", matched: null };
}