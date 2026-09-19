import { DEV_TOOLS } from "./config";

// Storage

const KEY = "dev-day-offset";
const DAY_MS = 86_400_000;

export function getDayOffset(): number {
  if (!DEV_TOOLS || typeof window === "undefined") return 0;
  try {
    const value = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function setDayOffset(days: number): void {
  try {
    if (days === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(days));
  } catch {
    return;
  }
}

export function subscribeDayOffset(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// Headers

export function devHeaders(): Record<string, string> {
  const offset = getDayOffset();
  if (offset === 0) return {};
  return { "x-dev-now": new Date(Date.now() + offset * DAY_MS).toISOString() };
}