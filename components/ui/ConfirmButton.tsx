"use client";

import { useEffect, useState } from "react";

type Props = {
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  className?: string;
};

export function ConfirmButton({ label, confirmLabel, onConfirm, className = "" }: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  const click = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
        armed ? "bg-berry text-white" : "border border-berry/40 text-berry hover:bg-berry/10"
      } ${className}`}
    >
      {busy ? "Deleting" : armed ? confirmLabel : label}
    </button>
  );
}