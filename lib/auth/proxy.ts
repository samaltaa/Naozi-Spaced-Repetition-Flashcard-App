import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { assertAuthEnv, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Routes

const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password"];
const PUBLIC_PAGES = ["/terms", "/privacy"];
const PUBLIC_PREFIXES = ["/auth/", "/api/"];

// Session

export async function updateSession(request: NextRequest) {
  assertAuthEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (PUBLIC_PAGES.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return response;

  const redirect = (target: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = target.split("?");
    url.pathname = pathname ?? "/";
    url.search = query ? `?${query}` : "";
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };

  if (!signedIn) {
    if (AUTH_PAGES.includes(path)) return response;
    if (path === "/reset-password") return redirect("/forgot-password");
    return redirect(`/sign-in?next=${encodeURIComponent(path + request.nextUrl.search)}`);
  }

  if (AUTH_PAGES.includes(path)) return redirect("/");
  return response;
}