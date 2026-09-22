import { NextResponse, type NextRequest } from "next/server";
import { HttpError, route } from "@/lib/api";
import { createAuthClient } from "@/lib/auth/server";
import { supabase } from "@/lib/supabase";
import { SignUpInput } from "@/lib/validation";

// Errors

const AUTH_ERRORS: Record<string, [number, string]> = {
  user_already_exists: [409, "An account with this email already exists. Try signing in."],
  email_exists: [409, "An account with this email already exists. Try signing in."],
  weak_password: [400, "Choose a stronger password."],
  email_address_invalid: [400, "Enter a valid email address."],
  over_email_send_rate_limit: [429, "Too many attempts. Wait a minute and try again."],
  over_request_rate_limit: [429, "Too many attempts. Wait a minute and try again."],
  unexpected_failure: [409, "That username was just taken. Try another."],
};

// Route

export const POST = route(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }

  const parsed = SignUpInput.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const input = parsed.data;

  const existing = await supabase.from("users").select("id").eq("username", input.username).maybeSingle();
  if (existing.error) throw new HttpError(500, existing.error.message);
  if (existing.data) throw new HttpError(409, "That username is taken. Try another.");

  const auth = await createAuthClient();
  const { data, error } = await auth.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { username: input.username, timezone: input.timezone } },
  });

  if (error) {
    const [status, message] = AUTH_ERRORS[error.code ?? ""] ?? [400, error.message];
    throw new HttpError(status, message);
  }

  return NextResponse.json({ signedIn: Boolean(data.session) }, { status: 201 });
});