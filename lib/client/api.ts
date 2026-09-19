import { devHeaders } from "./devClock";
import type {
  CourseDetail,
  Dashboard,
  ReviewRequest,
  ReviewResult,
  SessionMode,
  SessionPayload,
} from "./types";

// Errors

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Transport

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json", ...devHeaders() },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Endpoints

export const api = {
  dashboard: () => request<Dashboard>("/api/dashboard"),
  course: (courseId: string) => request<CourseDetail>(`/api/courses/${courseId}`),
  session: (courseId: string, mode: SessionMode) => request<SessionPayload>(`/api/courses/${courseId}/${mode}`),
  submitReview: (body: ReviewRequest) => request<ReviewResult>("/api/reviews", { method: "POST", body }),
};