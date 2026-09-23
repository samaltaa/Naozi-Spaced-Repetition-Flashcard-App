import "server-only";
import { HttpError, unwrap } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ReviewSubmission } from "@/lib/validation";
import {
  checkChoice,
  checkTyped,
  GRADUATING_INTERVAL_DAYS,
  LEARNING_STEPS,
  gradeFromCheck,
  initialCard,
  planLearnSession,
  planReviewSession,
  schedule,
  startOfUserDay,
  type CardState,
  type DiacriticMode,
  type ItemState,
  type PoolItem,
  type SessionItem,
  type SessionStep,
  type SrsSettings,
  type Verdict,
} from "@/lib/srs";

// Constants

const REVIEW_BATCH = 25;
const POOL_LIMIT = 500;

// Row types

interface UserRow {
  timezone: string;
  day_rollover_hour: number;
}

interface CourseRow {
  id: string;
  owner_id: string;
  visibility: string;
  target_lang: string;
  diacritic_mode: DiacriticMode;
  new_per_day: number;
  max_reviews_per_day: number;
  learning_steps: number;
  words_per_session: number;
}

interface ItemRow {
  id: string;
  course_id: string;
  level_id: string;
  prompt: string;
  answer: string;
  alternates: string[];
  reading: string | null;
  notes: string | null;
}

interface StateRow {
  user_id: string;
  item_id: string;
  course_id: string;
  state: ItemState;
  ease_factor: number | string;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  due_at: string | null;
  last_reviewed_at: string | null;
}

interface DashboardRow {
  course_id: string;
  title: string;
  target_lang: string;
  due_count: number;
  started_count: number;
  learned_count: number;
  total_items: number;
}

// Response types

export interface SessionPayload {
  mode: "learn" | "review";
  courseId: string;
  steps: SessionStep[];
  remainingToday: number;
  learningSteps: number;
}

export interface ReviewResult {
  correct: boolean;
  verdict: Verdict;
  grade: number;
  correctAnswer: string;
  stateAfter: ItemState;
  nextDueAt: string | null;
}

// Mappers

function toSessionItem(row: ItemRow): SessionItem {
  return {
    id: row.id,
    levelId: row.level_id,
    prompt: row.prompt,
    answer: row.answer,
    alternates: row.alternates,
    reading: row.reading,
    notes: row.notes,
  };
}

function toCard(row: StateRow): CardState {
  return {
    state: row.state,
    easeFactor: Number(row.ease_factor),
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    lapses: row.lapses,
    learningStep: row.learning_step,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
  };
}

function toStateRow(card: CardState, userId: string, itemId: string, courseId: string): StateRow {
  return {
    user_id: userId,
    item_id: itemId,
    course_id: courseId,
    state: card.state,
    ease_factor: card.easeFactor,
    interval_days: card.intervalDays,
    repetitions: card.repetitions,
    lapses: card.lapses,
    learning_step: card.learningStep,
    due_at: card.dueAt?.toISOString() ?? null,
    last_reviewed_at: card.lastReviewedAt?.toISOString() ?? null,
  };
}

// Context

async function loadContext(userId: string, courseId: string) {
  const [userRes, courseRes] = await Promise.all([
    supabase.from("users").select("timezone, day_rollover_hour").eq("id", userId).maybeSingle(),
    supabase
      .from("courses")
      .select(
        "id, owner_id, visibility, target_lang, diacritic_mode, new_per_day, max_reviews_per_day, learning_steps, words_per_session",
      )
      .eq("id", courseId)
      .maybeSingle(),
  ]);
  const user = unwrap<UserRow>(userRes);
  const course = unwrap<CourseRow>(courseRes);
  if (course.owner_id !== userId && course.visibility === "private") throw new HttpError(404, "Not found");

  const settings: SrsSettings = {
    learningSteps: course.learning_steps ?? LEARNING_STEPS,
    graduatingIntervalDays: GRADUATING_INTERVAL_DAYS,
    timezone: user.timezone,
    rolloverHour: user.day_rollover_hour,
    locale: course.target_lang,
    diacriticMode: course.diacritic_mode,
  };
  return { course, settings };
}

async function countToday(userId: string, courseId: string, since: Date, states: ItemState[]) {
  const { count, error } = await supabase
    .from("review_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .gte("reviewed_at", since.toISOString())
    .in("state_before", states);
  if (error) throw new HttpError(500, error.message);
  return count ?? 0;
}

async function loadPool(courseId: string): Promise<PoolItem[]> {
  const rows = unwrap<Pick<ItemRow, "id" | "level_id" | "answer" | "alternates">[]>(
    await supabase.from("items").select("id, level_id, answer, alternates").eq("course_id", courseId).limit(POOL_LIMIT),
  );
  return rows.map((r) => ({ id: r.id, levelId: r.level_id, answer: r.answer, alternates: r.alternates }));
}

// Sessions

export async function getLearnSession(userId: string, courseId: string, now: Date): Promise<SessionPayload> {
  const { course, settings } = await loadContext(userId, courseId);
  const dayStart = startOfUserDay(now, settings.timezone, settings.rolloverHour);
  const introduced = await countToday(userId, courseId, dayStart, ["new"]);
  const remaining = Math.max(0, course.new_per_day - introduced);
  const batch = Math.min(course.words_per_session, remaining);
  if (batch === 0) {
    return { mode: "learn", courseId, steps: [], remainingToday: 0, learningSteps: settings.learningSteps };
  }

  const [items, pool] = await Promise.all([
    supabase.rpc("new_items", { p_user_id: userId, p_course_id: courseId, p_limit: batch }),
    loadPool(courseId),
  ]);
  const rows = unwrap<ItemRow[]>(items);
  const steps = planLearnSession(rows.map(toSessionItem), pool, settings);
  return {
    mode: "learn",
    courseId,
    steps,
    remainingToday: remaining - rows.length,
    learningSteps: settings.learningSteps,
  };
}

export async function getReviewSession(userId: string, courseId: string, now: Date): Promise<SessionPayload> {
  const { course, settings } = await loadContext(userId, courseId);
  const dayStart = startOfUserDay(now, settings.timezone, settings.rolloverHour);
  const reviewed = await countToday(userId, courseId, dayStart, ["review", "relearning"]);
  const remaining = Math.max(0, course.max_reviews_per_day - reviewed);
  const limit = Math.min(REVIEW_BATCH, remaining);
  if (limit === 0) {
    return { mode: "review", courseId, steps: [], remainingToday: 0, learningSteps: settings.learningSteps };
  }

  const [due, pool] = await Promise.all([
    supabase
      .from("user_item_state")
      .select("*, items(*)")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .neq("state", "new")
      .lte("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(limit),
    loadPool(courseId),
  ]);
  const rows = unwrap<(StateRow & { items: ItemRow })[]>(due);
  const entries = rows.map((row) => ({ item: toSessionItem(row.items), card: toCard(row) }));
  const steps = planReviewSession(entries, pool, settings);
  return {
    mode: "review",
    courseId,
    steps,
    remainingToday: remaining - rows.length,
    learningSteps: settings.learningSteps,
  };
}

// Reviews

export async function submitReview(userId: string, input: ReviewSubmission, now: Date): Promise<ReviewResult> {
  const item = unwrap<ItemRow>(
    await supabase
      .from("items")
      .select("id, course_id, level_id, prompt, answer, alternates, reading, notes")
      .eq("id", input.itemId)
      .maybeSingle(),
  );
  const { settings } = await loadContext(userId, item.course_id);

  const stateRes = await supabase
    .from("user_item_state")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", item.id)
    .maybeSingle();
  if (stateRes.error) throw new HttpError(500, stateRes.error.message);
  const before = stateRes.data ? toCard(stateRes.data as StateRow) : initialCard();

  const check =
    input.testType === "multiple_choice"
      ? checkChoice(input.answer, item.answer, settings.locale)
      : checkTyped(input.answer, [item.answer, ...item.alternates], settings);
  const grade = gradeFromCheck(check, input.testType, input.responseMs);
  const after = schedule(before, grade, now, settings);
  const correct = check.verdict !== "wrong";

  const logRes = await supabase.from("review_log").insert({
    id: input.id,
    user_id: userId,
    item_id: item.id,
    course_id: item.course_id,
    test_type: input.testType,
    answer_given: input.answer,
    verdict: check.verdict,
    correct,
    grade,
    response_ms: input.responseMs,
    state_before: before.state,
    state_after: after.state,
    ease_after: after.easeFactor,
    interval_after: after.intervalDays,
    due_after: after.dueAt?.toISOString() ?? null,
    reviewed_at: now.toISOString(),
  });
  if (logRes.error) {
    if (logRes.error.code === "23505") throw new HttpError(409, "Review already recorded");
    throw new HttpError(500, logRes.error.message);
  }

  const upsertRes = await supabase.from("user_item_state").upsert(toStateRow(after, userId, item.id, item.course_id));
  if (upsertRes.error) throw new HttpError(500, upsertRes.error.message);

  return {
    correct,
    verdict: check.verdict,
    grade,
    correctAnswer: item.answer,
    stateAfter: after.state,
    nextDueAt: after.dueAt?.toISOString() ?? null,
  };
}

// Dashboard

export async function getDashboard(userId: string, now: Date) {
  const rows = unwrap<DashboardRow[]>(
    await supabase.rpc("dashboard", { p_user_id: userId, p_now: now.toISOString() }),
  );
  const courses = rows.map((r) => ({
    courseId: r.course_id,
    title: r.title,
    targetLang: r.target_lang,
    dueCount: Number(r.due_count),
    newAvailable: Number(r.total_items) - Number(r.started_count),
    learnedCount: Number(r.learned_count),
    totalItems: Number(r.total_items),
  }));
  return { totalDue: courses.reduce((sum, c) => sum + c.dueCount, 0), courses };
}