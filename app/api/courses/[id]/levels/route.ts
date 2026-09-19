import { NextResponse, type NextRequest } from "next/server";
import { getUserId, parseId, parseJson, route } from "@/lib/api";
import { createLevel } from "@/lib/services/courses";
import { CreateLevelInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const courseId = parseId((await params).id);
  const input = await parseJson(req, CreateLevelInput);
  return NextResponse.json(await createLevel(getUserId(), courseId, input), { status: 201 });
});