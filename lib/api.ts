import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/auth/server";
import { supabase } from "@/lib/supabase";

// Errors

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

// Request context

export interface AuthUser {
  id: string;
  email: string | null;
}

export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;

  const { data, error } = bearer
    ? await supabase.auth.getClaims(bearer)
    : await (await createAuthClient()).auth.getClaims();

  const claims = data?.claims;
  if (error || !claims?.sub) throw new HttpError(401, "Sign in to continue");
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

export async function requireUserId(req: NextRequest): Promise<string> {
  return (await requireAuth(req)).id;
}

export function getNow(req: NextRequest): Date {
  if (process.env.NODE_ENV !== "production") {
    const header = req.headers.get("x-dev-now");
    if (header) {
      const date = new Date(header);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return new Date();
}

// Parsing

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "Validation failed", result.error.issues);
  return result.data;
}

export function parseId(value: string): string {
  const result = z.guid().safeParse(value);
  if (!result.success) throw new HttpError(400, "Invalid id");
  return result.data;
}

// Supabase results

export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new HttpError(500, result.error.message);
  if (result.data === null) throw new HttpError(404, "Not found");
  return result.data;
}

// Responses

export function noContent(): Response {
  return new NextResponse(null, { status: 204 });
}

export function route<C = unknown>(handler: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}