import { describe, expect, it } from "vitest";
import { describePlan, levelSlots, mergeImported, planLevelFill, slotLevelNumber } from "./levels";
import type { CourseItem, CourseLevel } from "./types";

// Fixtures

function item(id: string, position: number): CourseItem {
  return { id, prompt: id, answer: id, alternates: [], reading: null, notes: null, position };
}

function level(id: string, position: number, items: CourseItem[] = []): CourseLevel {
  return { id, title: `Level ${position + 1}`, position, items };
}

// Planning

describe("planLevelFill", () => {
  it("fills the starting level before creating new ones", () => {
    expect(planLevelFill(25, 40, 30)).toEqual([5, 30, 5]);
  });

  it("starts a new level straight away when the starting level is full", () => {
    expect(planLevelFill(30, 10, 30)).toEqual([0, 10]);
    expect(planLevelFill(45, 10, 30)).toEqual([0, 10]);
  });

  it("keeps everything in the starting level when it fits", () => {
    expect(planLevelFill(0, 12, 30)).toEqual([12]);
  });

  it("splits exactly on level boundaries", () => {
    expect(planLevelFill(0, 60, 30)).toEqual([30, 30]);
  });

  it("handles an empty import", () => {
    expect(planLevelFill(10, 0, 30)).toEqual([0]);
  });
});

describe("levelSlots", () => {
  it("assigns every word to its level slot in order", () => {
    expect(levelSlots([2, 3, 1])).toEqual([0, 0, 1, 1, 1, 2]);
  });
});

describe("slotLevelNumber", () => {
  it("numbers new levels after the existing ones", () => {
    expect(slotLevelNumber(0, 2, 3)).toBe(2);
    expect(slotLevelNumber(1, 2, 3)).toBe(4);
    expect(slotLevelNumber(2, 2, 3)).toBe(5);
  });
});

describe("describePlan", () => {
  it("describes filling and new levels", () => {
    expect(describePlan([5, 30, 5], 2, 3)).toBe(
      "5 words go into Level 2, and 35 into 2 new levels, Level 4 to Level 5.",
    );
  });

  it("describes a single new level", () => {
    expect(describePlan([0, 10], 1, 1)).toBe("10 into a new Level 2.");
  });

  it("describes a plain import", () => {
    expect(describePlan([1], 1, 1)).toBe("1 word goes into Level 1.");
  });
});

// Merging

describe("mergeImported", () => {
  it("appends to existing levels and adds new ones in order", () => {
    const levels = [level("a", 0, [item("x", 0)]), level("b", 1)];
    const imported = [level("c", 3, [item("z", 0)]), level("b", 1, [item("y", 0)]), level("d", 2, [item("w", 0)])];
    const merged = mergeImported(levels, imported);
    expect(merged.map((l) => l.id)).toEqual(["a", "b", "d", "c"]);
    expect(merged[1]?.items.map((i) => i.id)).toEqual(["y"]);
    expect(merged[0]?.items.map((i) => i.id)).toEqual(["x"]);
  });
});
