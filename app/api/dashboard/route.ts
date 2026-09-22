import { NextResponse, type NextRequest } from "next/server";
import { getNow, requireUserId, route } from "@/lib/api";
import { getDashboard } from "@/lib/services/study";

export const GET = route(async (req: NextRequest) => {
  const userId = await requireUserId(req);
  return NextResponse.json(await getDashboard(userId, getNow(req)));
});