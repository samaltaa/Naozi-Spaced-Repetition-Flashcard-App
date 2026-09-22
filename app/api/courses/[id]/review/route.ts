import { NextResponse, type NextRequest } from "next/server";
import { getNow, parseId, requireUserId, route } from "@/lib/api";
import { getReviewSession } from "@/lib/services/study";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (req: NextRequest, { params }: Context) => {
  const userId = await requireUserId(req);
  const courseId = parseId((await params).id);
  return NextResponse.json(await getReviewSession(userId, courseId, getNow(req)));
});