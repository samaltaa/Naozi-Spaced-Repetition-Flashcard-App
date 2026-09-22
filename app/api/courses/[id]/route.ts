import { NextResponse, type NextRequest } from "next/server";
import { noContent, parseId, parseJson, requireUserId, route } from "@/lib/api";
import { deleteCourse, getCourse, updateCourse } from "@/lib/services/courses";
import { UpdateCourseInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  const course = await getCourse(userId, id);
  return NextResponse.json({ ...course, is_owner: course.owner_id === userId });
});

export const PATCH = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  const input = await parseJson(req, UpdateCourseInput);
  return NextResponse.json(await updateCourse(userId, id, input));
});

export const DELETE = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  await deleteCourse(userId, id);
  return noContent();
});