"use client";

import { useSyncExternalStore } from "react";
import { DEV_TOOLS } from "@/lib/client/config";
import { getDayOffset, setDayOffset, subscribeDayOffset } from "@/lib/client/devClock";

const serverOffset = () => 0;

const BUTTON = "flex h-10 min-w-10 items-center justify-center rounded-full px-2 hover:bg-white/15";

export function DevTimeTravel() {
  const offset = useSyncExternalStore(subscribeDayOffset, getDayOffset, serverOffset);

  if (!DEV_TOOLS) return null;

  const change = (days: number) => {
    setDayOffset(days);
    window.location.reload();
  };

  const label = offset === 0 ? "Today" : `${offset > 0 ? "+" : ""}${offset} days`;

  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-3 pr-0.5 text-xs font-semibold">
      <span className="text-white/60">Dev clock</span>
      <button type="button" onClick={() => change(offset - 1)} aria-label="Go back one day" className={BUTTON}>
        −
      </button>
      <span className="min-w-14 text-center tabular-nums">{label}</span>
      <button type="button" onClick={() => change(offset + 1)} aria-label="Go forward one day" className={BUTTON}>
        +
      </button>
      {offset !== 0 ? (
        <button type="button" onClick={() => change(0)} className={BUTTON}>
          Reset
        </button>
      ) : null}
    </div>
  );
}