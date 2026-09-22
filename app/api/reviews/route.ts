import { NextResponse, type NextRequest } from "next/server";
import { getNow, parseJson, requireUserId, route } from "@/lib/api";
import { submitReview } from "@/lib/services/study";
import { ReviewSubmission } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  const userId = await requireUserId(req);
  const input = await parseJson(req, ReviewSubmission);
  return NextResponse.json(await submitReview(userId, input, getNow(req)));
});