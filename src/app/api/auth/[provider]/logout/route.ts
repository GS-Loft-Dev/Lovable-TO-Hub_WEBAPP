import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  const session = await getSession();
  if (provider === "hubspot") delete session.hubspot;
  if (provider === "lovable") delete session.lovable;
  await session.save();
  return NextResponse.json({ ok: true });
});
