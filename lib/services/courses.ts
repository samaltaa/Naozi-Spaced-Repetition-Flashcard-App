import "server-only";
import { HttpError, unwrap } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type {
  CreateCourseInput,
  CreateItemsInput,
  CreateLevelInput,
  ItemInput,
  UpdateCourseInput,
  UpdateItemInput,
  UpdateLevelInput,
} from "@/lib/validation";

// Mappers

function courseColumns(input: UpdateCourseInput) {
  return {
    title: input.title,
    description: input.description,
    source_lang: input.sourceLang,
    target_lang: input.targetLang,
    visibility: input.visibility,
    diacritic_mode: input.diacriticMode,
    new_per_day: input.newPerDay,
    max_reviews_per_day: input.maxReviewsPerDay,
  };
}

function itemColumns(input: UpdateItemInput) {
  return {
    prompt: input.prompt,
    answer: input.answer,
    alternates: input.alternates,
    reading: input.reading,
    notes: input.notes,
  };
}

function newItemColumns(input: ItemInput) {
  return {
    ...itemColumns(input),
    alternates: input.alternates ?? [],
    reading: input.reading ?? null,
    notes: input.notes ?? null,
  };
}

const touched = () => ({ updated_at: new Date().toISOString() });

export type CourseWithLevels = { owner_id: string } & Record<string, unknown>;

// Ownership

async function assertCourseOwner(userId: string, courseId: string): Promise<void> {
  unwrap(await supabase.from("courses").select("id").eq("id", courseId).eq("owner_id", userId).maybeSingle());
}

async function getOwnedLevel(userId: string, levelId: string): Promise<{ id: string; course_id: string }> {
  return unwrap(
    await supabase
      .from("levels")
      .select("id, course_id, courses!inner(owner_id)")
      .eq("id", levelId)
      .eq("courses.owner_id", userId)
      .maybeSingle(),
  );
}

async function assertItemOwner(userId: string, itemId: string): Promise<void> {
  unwrap(
    await supabase
      .from("items")
      .select("id, courses!inner(owner_id)")
      .eq("id", itemId)
      .eq("courses.owner_id", userId)
      .maybeSingle(),
  );
}

async function nextPosition(table: "levels" | "items", column: "course_id" | "level_id", value: string) {
  const { data, error } = await supabase
    .from(table)
    .select("position")
    .eq(column, value)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data ? (data.position as number) + 1 : 0;
}

// Courses

export async function listCourses(userId: string) {
  return unwrap(
    await supabase.from("courses").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
  );
}

export async function getCourse(userId: string, courseId: string): Promise<CourseWithLevels> {
  return unwrap<CourseWithLevels>(
    await supabase
      .from("courses")
      .select("*, levels(*, items(*))")
      .eq("id", courseId)
      .or(`owner_id.eq.${userId},visibility.neq.private`)
      .order("position", { referencedTable: "levels" })
      .order("position", { referencedTable: "levels.items" })
      .maybeSingle(),
  );
}

export async function createCourse(userId: string, input: CreateCourseInput) {
  return unwrap(
    await supabase
      .from("courses")
      .insert({ ...courseColumns(input), owner_id: userId })
      .select()
      .single(),
  );
}

export async function updateCourse(userId: string, courseId: string, input: UpdateCourseInput) {
  return unwrap(
    await supabase
      .from("courses")
      .update({ ...courseColumns(input), ...touched() })
      .eq("id", courseId)
      .eq("owner_id", userId)
      .select()
      .maybeSingle(),
  );
}

export async function deleteCourse(userId: string, courseId: string) {
  unwrap(await supabase.from("courses").delete().eq("id", courseId).eq("owner_id", userId).select("id").maybeSingle());
}

// Levels

export async function createLevel(userId: string, courseId: string, input: CreateLevelInput) {
  await assertCourseOwner(userId, courseId);
  const position = await nextPosition("levels", "course_id", courseId);
  return unwrap(
    await supabase.from("levels").insert({ course_id: courseId, title: input.title, position }).select().single(),
  );
}

export async function updateLevel(userId: string, levelId: string, input: UpdateLevelInput) {
  await getOwnedLevel(userId, levelId);
  return unwrap(
    await supabase
      .from("levels")
      .update({ title: input.title, position: input.position })
      .eq("id", levelId)
      .select()
      .single(),
  );
}

export async function deleteLevel(userId: string, levelId: string) {
  await getOwnedLevel(userId, levelId);
  unwrap(await supabase.from("levels").delete().eq("id", levelId).select("id").maybeSingle());
}

// Items

export async function createItems(userId: string, levelId: string, input: CreateItemsInput) {
  const level = await getOwnedLevel(userId, levelId);
  const list = Array.isArray(input) ? input : [input];
  const start = await nextPosition("items", "level_id", levelId);
  const rows = list.map((item, index) => ({
    ...newItemColumns(item),
    course_id: level.course_id,
    level_id: level.id,
    position: start + index,
  }));
  return unwrap(await supabase.from("items").insert(rows).select());
}

export async function updateItem(userId: string, itemId: string, input: UpdateItemInput) {
  await assertItemOwner(userId, itemId);
  return unwrap(
    await supabase
      .from("items")
      .update({ ...itemColumns(input), ...touched() })
      .eq("id", itemId)
      .select()
      .single(),
  );
}

export async function deleteItem(userId: string, itemId: string) {
  await assertItemOwner(userId, itemId);
  unwrap(await supabase.from("items").delete().eq("id", itemId).select("id").maybeSingle());
}