"use client";

import { useState } from "react";
import { AUTH_INPUT, AUTH_LABEL } from "./AuthShell";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
};

export function PasswordField({ id, label, value, onChange, autoComplete, hint }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className={AUTH_LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className={`${AUTH_INPUT} pr-20`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="absolute inset-y-0 right-1 my-auto h-10 rounded-md px-3 text-sm font-bold text-ink/60 hover:text-ink"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? <p className="mt-1 text-sm text-ink/60">{hint}</p> : null}
    </div>
  );
}