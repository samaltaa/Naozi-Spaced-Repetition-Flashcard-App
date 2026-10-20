import { NextResponse, type NextRequest } from "next/server";
import { parseId, requireUserId, route } from "@/lib/api";
import { discardExtraction } from "@/lib/services/curator";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  return NextResponse.json(await discardExtraction(userId, id));
});
