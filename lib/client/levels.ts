import type { CourseLevel } from "./types";

// Planning

export function planLevelFill(existing: number, total: number, perLevel: number): number[] {
  const size = Math.max(1, Math.floor(perLevel));
  const first = Math.min(total, Math.max(0, size - existing));
  const counts = [first];
  for (let left = total - first; left > 0; left -= size) counts.push(Math.min(size, left));
  return counts;
}

export function levelSlots(plan: readonly number[]): number[] {
  return plan.flatMap((count, slot) => Array.from({ length: count }, () => slot));
}

export function slotLevelNumber(slot: number, startNumber: number, levelCount: number): number {
  return slot === 0 ? startNumber : levelCount + slot;
}

export function describePlan(plan: readonly number[], startNumber: number, levelCount: number): string {
  const [first = 0, ...rest] = plan;
  const parts: string[] = [];
  if (first > 0) parts.push(`${first} ${first === 1 ? "word goes" : "words go"} into Level ${startNumber}`);
  const moved = rest.reduce((sum, n) => sum + n, 0);
  if (rest.length === 1) {
    parts.push(`${moved} into a new Level ${levelCount + 1}`);
  } else if (rest.length > 1) {
    parts.push(`${moved} into ${rest.length} new levels, Level ${levelCount + 1} to Level ${levelCount + rest.length}`);
  }
  return parts.length > 0 ? `${parts.join(", and ")}.` : "";
}

// Merging

export function mergeImported(levels: readonly CourseLevel[], imported: readonly CourseLevel[]): CourseLevel[] {
  const byId = new Map(imported.map((level) => [level.id, level]));
  const merged = levels.map((level) => {
    const added = byId.get(level.id);
    return added ? { ...level, items: [...level.items, ...added.items] } : level;
  });
  const known = new Set(levels.map((level) => level.id));
  const created = imported.filter((level) => !known.has(level.id)).sort((a, b) => a.position - b.position);
  return [...merged, ...created];
}

export function countItems(levels: readonly CourseLevel[]): number {
  return levels.reduce((sum, level) => sum + level.items.length, 0);
}
