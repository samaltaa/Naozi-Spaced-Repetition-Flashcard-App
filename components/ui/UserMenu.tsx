"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/browser";
import { api } from "@/lib/client/api";
import { useAsync } from "@/lib/client/useAsync";

export function UserMenu() {
  const router = useRouter();
  const { state } = useAsync(api.me);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (state.status !== "ready") return <div className="h-11 w-11" aria-hidden="true" />;

  const me = state.data;
  const initial = me.username.charAt(0).toUpperCase() || "?";

  const signOut = async () => {
    setBusy(true);
    await authClient().auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-11 items-center gap-2 rounded-full pl-1 pr-1 hover:bg-white/10 sm:pr-3"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sun text-sm font-extrabold text-ink">
          {initial}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-bold sm:inline">{me.username}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-xl border border-ink/10 bg-white text-ink shadow-xl"
        >
          <div className="border-b border-ink/10 px-4 py-3">
            <p className="truncate font-extrabold">{me.username}</p>
            {me.email ? <p className="truncate text-sm text-ink/60">{me.email}</p> : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="flex min-h-12 w-full items-center px-4 text-left font-bold hover:bg-ink/5 disabled:opacity-50"
          >
            {busy ? "Signing out" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}