import { NextResponse, type NextRequest } from "next/server";
import { parseId, parseJson, requireUserId, route } from "@/lib/api";
import { importItems } from "@/lib/services/courses";
import { ImportItemsInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const levelId = parseId((await params).id);
  const input = await parseJson(req, ImportItemsInput);
  return NextResponse.json(await importItems(userId, levelId, input.items), { status: 201 });
});
