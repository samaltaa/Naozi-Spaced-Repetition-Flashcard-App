import { NextResponse, type NextRequest } from "next/server";
import { getNow, getUserId, route } from "@/lib/api";
import { getDashboard } from "@/lib/services/study";

export const GET = route(async (req: NextRequest) => {
  return NextResponse.json(await getDashboard(getUserId(), getNow(req)));
});