import { NextResponse, type NextRequest } from "next/server";
import { getUserId, parseId, parseJson, route } from "@/lib/api";
import { createItems } from "@/lib/services/courses";
import { CreateItemsInput } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (req: NextRequest, { params }: Context) => {
  const levelId = parseId((await params).id);
  const input = await parseJson(req, CreateItemsInput);
  return NextResponse.json(await createItems(getUserId(), levelId, input), { status: 201 });
});