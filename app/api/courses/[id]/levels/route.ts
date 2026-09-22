import { NextResponse, type NextRequest } from "next/server";
import { parseId, parseJson, requireUserId, route } from "@/lib/api";
import { createLevel } from "@/lib/services/courses";
import { CreateLevelInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const courseId = parseId((await params).id);
  const input = await parseJson(req, CreateLevelInput);
  return NextResponse.json(await createLevel(userId, courseId, input), { status: 201 });
});