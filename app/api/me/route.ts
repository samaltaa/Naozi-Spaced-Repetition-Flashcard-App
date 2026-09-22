import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, route, unwrap } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const profile = unwrap<{ username: string | null; display_name: string; timezone: string }>(
    await supabase.from("users").select("username, display_name, timezone").eq("id", user.id).maybeSingle(),
  );
  return NextResponse.json({
    id: user.id,
    email: user.email,
    username: profile.username ?? profile.display_name,
    timezone: profile.timezone,
  });
});