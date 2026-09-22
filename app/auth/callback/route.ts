import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/env";
import { createAuthClient } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const auth = await createAuthClient();
    const { error } = await auth.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/sign-in?error=link", origin));
}