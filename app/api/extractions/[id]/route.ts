import { NextResponse, type NextRequest } from "next/server";
import { parseId, requireUserId, route } from "@/lib/api";
import { getExtraction } from "@/lib/services/curator";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  return NextResponse.json(await getExtraction(userId, id));
});
