import { NextResponse, type NextRequest } from "next/server";
import { getUserId, noContent, parseId, parseJson, route } from "@/lib/api";
import { deleteCourse, getCourse, updateCourse } from "@/lib/services/courses";
import { UpdateCourseInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  return NextResponse.json(await getCourse(getUserId(), id));
});

export const PATCH = route(async (req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  const input = await parseJson(req, UpdateCourseInput);
  return NextResponse.json(await updateCourse(getUserId(), id, input));
});

export const DELETE = route(async (_req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  await deleteCourse(getUserId(), id);
  return noContent();
});