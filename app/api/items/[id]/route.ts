import { NextResponse, type NextRequest } from "next/server";
import { getUserId, noContent, parseId, parseJson, route } from "@/lib/api";
import { deleteItem, updateItem } from "@/lib/services/courses";
import { UpdateItemInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  const input = await parseJson(req, UpdateItemInput);
  return NextResponse.json(await updateItem(getUserId(), id, input));
});

export const DELETE = route(async (_req: NextRequest, { params }: Context) => {
  const id = parseId((await params).id);
  await deleteItem(getUserId(), id);
  return noContent();
});