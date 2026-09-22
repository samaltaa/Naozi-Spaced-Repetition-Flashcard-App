"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/browser";
import { AUTH_SUBMIT, AuthShell, FormError } from "./AuthShell";
import { PasswordField } from "./PasswordField";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError("Passwords need at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await authClient().auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(
        updateError.code === "same_password"
          ? "Choose a password different from your current one."
          : updateError.message,
      );
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <PasswordField
          id="confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <FormError message={error} />
        <button type="submit" disabled={busy} className={AUTH_SUBMIT}>
          {busy ? "Saving" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}