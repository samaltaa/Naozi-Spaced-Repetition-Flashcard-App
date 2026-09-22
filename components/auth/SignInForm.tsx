"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/browser";
import { AUTH_INPUT, AUTH_LABEL, AUTH_LINK, AUTH_SUBMIT, AuthShell, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";

type Props = {
  next: string;
  linkError: boolean;
};

export function SignInForm({ next, linkError }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "That link has expired or was already used. Request a new one." : null,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await authClient().auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setBusy(false);
      setError(
        signInError.code === "invalid_credentials"
          ? "Email or password is incorrect."
          : signInError.message,
      );
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep your words growing."
      footer={
        <>
          New here?{" "}
          <Link href="/sign-up" className={AUTH_LINK}>
            Create an account
          </Link>
        </>
      }
    >
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
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <div className="-mt-2 text-right text-sm">
          <Link href="/forgot-password" className={AUTH_LINK}>
            Forgot password?
          </Link>
        </div>
        <FormError message={error} />
        <button type="submit" disabled={busy} className={AUTH_SUBMIT}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}