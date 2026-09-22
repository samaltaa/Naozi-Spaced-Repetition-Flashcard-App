import { NextResponse, type NextRequest } from "next/server";
import { noContent, parseId, parseJson, requireUserId, route } from "@/lib/api";
import { deleteLevel, updateLevel } from "@/lib/services/courses";
import { UpdateLevelInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  const input = await parseJson(req, UpdateLevelInput);
  return NextResponse.json(await updateLevel(userId, id, input));
});

export const DELETE = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  await deleteLevel(userId, id);
  return noContent();
});