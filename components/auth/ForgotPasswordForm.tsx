"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/browser";
import { AUTH_INPUT, AUTH_LABEL, AUTH_LINK, AUTH_SUBMIT, AuthShell, FormError } from "./AuthShell";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: resetError } = await authClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your email and we'll send you a link to set a new password."}
      footer={
        <Link href="/sign-in" className={AUTH_LINK}>
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg bg-leaf/10 px-4 py-3 font-semibold text-leaf-dark" role="status">
          If an account exists for {email.trim()}, a reset link is on its way. Open it in this browser.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className={AUTH_LABEL}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
              className={AUTH_INPUT}
            />
          </div>
          <FormError message={error} />
          <button type="submit" disabled={busy} className={AUTH_SUBMIT}>
            {busy ? "Sending" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}