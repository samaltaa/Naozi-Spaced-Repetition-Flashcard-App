import { NextResponse, type NextRequest } from "next/server";
import { parseId, parseJson, requireUserId, route } from "@/lib/api";
import { importExtraction } from "@/lib/services/curator";
import { ImportExtractionInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const id = parseId((await params).id);
  const input = await parseJson(req, ImportExtractionInput);
  return NextResponse.json(await importExtraction(userId, id, input), { status: 201 });
});
