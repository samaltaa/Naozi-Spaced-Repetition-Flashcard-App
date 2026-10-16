import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requireUserId, route } from "@/lib/api";
import { articleSupport } from "@/lib/services/curator";
import { LangCode } from "@/lib/validation";

type Context = { params: Promise<{ lang: string }> };

export const GET = route(async (req: NextRequest, { params }: Context) => {
  await requireUserId(req);
  const lang = LangCode.safeParse((await params).lang);
  if (!lang.success) throw new HttpError(400, "Invalid language code");
  return NextResponse.json(await articleSupport(lang.data));
});
