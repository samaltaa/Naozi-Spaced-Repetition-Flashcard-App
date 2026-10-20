import { NextResponse, type NextRequest } from "next/server";
import { parseId, parseJson, requireUserId, route } from "@/lib/api";
import { startExtraction } from "@/lib/services/curator";
import { StartExtractionInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const levelId = parseId((await params).id);
  const input = await parseJson(req, StartExtractionInput);
  return NextResponse.json(await startExtraction(userId, levelId, input), { status: 202 });
});
