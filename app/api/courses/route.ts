import { NextResponse, type NextRequest } from "next/server";
import { getUserId, parseJson, route } from "@/lib/api";
import { createCourse, listCourses } from "@/lib/services/courses";
import { CreateCourseInput } from "@/lib/validation";

export const GET = route(async () => {
  return NextResponse.json(await listCourses(getUserId()));
});

export const POST = route(async (req: NextRequest) => {
  const input = await parseJson(req, CreateCourseInput);
  return NextResponse.json(await createCourse(getUserId(), input), { status: 201 });
});