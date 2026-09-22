import { NextResponse, type NextRequest } from "next/server";
import { parseJson, requireUserId, route } from "@/lib/api";
import { createCourse, listCourses } from "@/lib/services/courses";
import { CreateCourseInput } from "@/lib/validation";

export const GET = route(async (req: NextRequest) => {
  const userId = await requireUserId(req);
  return NextResponse.json(await listCourses(userId));
});

export const POST = route(async (req: NextRequest) => {
  const userId = await requireUserId(req);
  const input = await parseJson(req, CreateCourseInput);
  return NextResponse.json(await createCourse(userId, input), { status: 201 });
});