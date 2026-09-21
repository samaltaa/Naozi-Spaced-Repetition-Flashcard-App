"use client";

import { useState } from "react";
import { isKnownLanguage, LANGUAGE_OPTIONS, languageName } from "@/lib/client/languages";

// Constants

const OTHER = "__other";

const SELECT =
  "min-h-11 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-base font-semibold outline-none focus:border-water";

// Component

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
};

export function LanguagePicker({ id, label, value, onChange }: Props) {
  const [custom, setCustom] = useState(() => value !== "" && !isKnownLanguage(value));
  const selected = custom ? OTHER : value;

  const pick = (next: string) => {
    if (next === OTHER) {
      setCustom(true);
      onChange("");
      return;
    }
    setCustom(false);
    onChange(next);
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
      </label>
      <select id={id} value={selected} onChange={(e) => pick(e.target.value)} className={SELECT}>
        <option value="" disabled>
          Choose a language
        </option>
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
        <option value={OTHER}>Other (enter a code)</option>
      </select>

      {custom ? (
        <>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Language code, for example yue"
            aria-label={`${label} code`}
            className={`${SELECT} mt-2`}
          />
          <p className="mt-1 text-sm text-ink/60">
            {value.trim() ? languageName(value.trim()) : "Use an ISO 639 code"}
          </p>
        </>
      ) : value ? (
        <p className="mt-1 text-sm text-ink/60">Code: {value}</p>
      ) : null}
    </div>
  );
}