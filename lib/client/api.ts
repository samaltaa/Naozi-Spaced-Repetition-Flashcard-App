import { devHeaders } from "./devClock";
import type {
  CourseDetail,
  CourseFormValues,
  CourseItem,
  CourseRecord,
  CreateLevelInput,
  Dashboard,
  ItemInput,
  LevelRecord,
  Me,
  ReviewRequest,
  ReviewResult,
  SessionMode,
  SessionPayload,
  SignUpRequest,
  UpdateCourseInput,
  UpdateItemInput,
  UpdateLevelInput,
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
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/sign-in?next=${next}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Endpoints

export const api = {
  me: () => request<Me>("/api/me"),
  signUp: (body: SignUpRequest) => request<{ signedIn: boolean }>("/api/auth/sign-up", { method: "POST", body }),

  dashboard: () => request<Dashboard>("/api/dashboard"),
  course: (courseId: string) => request<CourseDetail>(`/api/courses/${courseId}`),
  session: (courseId: string, mode: SessionMode) => request<SessionPayload>(`/api/courses/${courseId}/${mode}`),
  submitReview: (body: ReviewRequest) => request<ReviewResult>("/api/reviews", { method: "POST", body }),

  createCourse: (body: CourseFormValues) => request<CourseRecord>("/api/courses", { method: "POST", body }),
  updateCourse: (courseId: string, body: UpdateCourseInput) =>
    request<CourseRecord>(`/api/courses/${courseId}`, { method: "PATCH", body }),
  deleteCourse: (courseId: string) => request<void>(`/api/courses/${courseId}`, { method: "DELETE" }),

  createLevel: (courseId: string, body: CreateLevelInput) =>
    request<LevelRecord>(`/api/courses/${courseId}/levels`, { method: "POST", body }),
  updateLevel: (levelId: string, body: UpdateLevelInput) =>
    request<LevelRecord>(`/api/levels/${levelId}`, { method: "PATCH", body }),
  deleteLevel: (levelId: string) => request<void>(`/api/levels/${levelId}`, { method: "DELETE" }),

  createItems: (levelId: string, body: ItemInput | ItemInput[]) =>
    request<CourseItem[]>(`/api/levels/${levelId}/items`, { method: "POST", body }),
  updateItem: (itemId: string, body: UpdateItemInput) =>
    request<CourseItem>(`/api/items/${itemId}`, { method: "PATCH", body }),
  deleteItem: (itemId: string) => request<void>(`/api/items/${itemId}`, { method: "DELETE" }),
};