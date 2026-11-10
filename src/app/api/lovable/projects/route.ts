import { NextResponse } from "next/server";
import { HttpError, handle } from "@/lib/http";
import { listProjects, lovableAuth } from "@/lib/integrations/lovable";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const session = await getSession();
  const auth = await lovableAuth(session);
  if (!auth) throw new HttpError(401, "Log in with Lovable first.");
  const query = new URL(req.url).searchParams.get("q") ?? undefined;
  return NextResponse.json({ projects: await listProjects(auth, { query }) });
});
