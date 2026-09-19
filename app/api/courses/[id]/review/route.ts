import { NextResponse, type NextRequest } from "next/server";
import { getNow, getUserId, parseId, route } from "@/lib/api";
import { getReviewSession } from "@/lib/services/study";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (req: NextRequest, { params }: Context) => {
  const courseId = parseId((await params).id);
  return NextResponse.json(await getReviewSession(getUserId(), courseId, getNow(req)));
});