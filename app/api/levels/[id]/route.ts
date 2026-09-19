import { NextResponse, type NextRequest } from "next/server";
import { getUserId, noContent, parseId, parseJson, route } from "@/lib/api";
import { deleteLevel, updateLevel } from "@/lib/services/courses";
import { UpdateLevelInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  const input = await parseJson(req, UpdateLevelInput);
  return NextResponse.json(await updateLevel(getUserId(), id, input));
});

export const DELETE = route(async (_req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  await deleteLevel(getUserId(), id);
  return noContent();
});