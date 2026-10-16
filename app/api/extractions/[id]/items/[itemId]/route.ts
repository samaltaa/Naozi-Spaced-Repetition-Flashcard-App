import { NextResponse, type NextRequest } from "next/server";
import { parseId, parseJson, requireUserId, route } from "@/lib/api";
import { updateDraft } from "@/lib/services/curator";
import { UpdateDraftInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string; itemId: string }> };

export const PATCH = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const { id, itemId } = await params;
  const input = await parseJson(req, UpdateDraftInput);
  return NextResponse.json(await updateDraft(userId, parseId(id), parseId(itemId), input));
});
