import { NextResponse, type NextRequest } from "next/server";
import { getNow, getUserId, parseJson, route } from "@/lib/api";
import { submitReview } from "@/lib/services/study";
import { ReviewSubmission } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  const input = await parseJson(req, ReviewSubmission);
  return NextResponse.json(await submitReview(getUserId(), input, getNow(req)));
});