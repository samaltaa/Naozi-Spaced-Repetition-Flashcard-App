"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { PRIVACY_URL, TERMS_URL } from "@/lib/client/config";
import { AUTH_INPUT, AUTH_LABEL, AUTH_LINK, AUTH_SUBMIT, AuthShell, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";

// Validation

const USERNAME = /^[a-z0-9_]{3,20}$/;

function validate(username: string, email: string, password: string, accepted: boolean): string | null {
  if (!USERNAME.test(username)) return "Usernames use 3 to 20 lowercase letters, numbers or underscores.";
  if (!email.includes("@")) return "Enter a valid email address.";
  if (password.length < 8) return "Passwords need at least 8 characters.";
  if (!accepted) return "Accept the terms to create an account.";
  return null;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Component

export function SignUpForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = validate(username, email.trim(), password, accepted);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.signUp({
        username,
        email: email.trim(),
        password,
        timezone: browserTimeZone(),
        acceptTerms: accepted,
      });
      if (!result.signedIn) {
        setBusy(false);
        setError("Check your email to confirm your account, then sign in.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err, "Your account wasn't created. Try again."));
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Build courses, share them, and learn with spaced repetition."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className={AUTH_LINK}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="username" className={AUTH_LABEL}>
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            required
            className={AUTH_INPUT}
          />
          <p className="mt-1 text-sm text-ink/60">Lowercase letters, numbers and underscores. Shown on shared courses.</p>
        </div>
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
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-leaf"
          />
          <span>
            I agree to the{" "}
            <Link href={TERMS_URL} className="font-bold text-water hover:underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href={PRIVACY_URL} className="font-bold text-water hover:underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        <FormError message={error} />
        <button type="submit" disabled={busy} className={AUTH_SUBMIT}>
          {busy ? "Creating account" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}