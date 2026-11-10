import { NextResponse } from "next/server";
import { HttpError, handle } from "@/lib/http";
import { hubspotConnection } from "@/lib/integrations/hubspot";
import { loadAssetBytes } from "@/lib/jobs";
import { publishToHubSpot } from "@/lib/publish";
import { getSession } from "@/lib/session";
import { requireJob } from "@/lib/require-job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const job = await requireJob(ctx);
  const session = await getSession();
  const conn = await hubspotConnection(session);
  if (!conn) throw new HttpError(401, "Log in with HubSpot first.");
  const result = await publishToHubSpot(conn, job.model, await loadAssetBytes(job));
  return NextResponse.json(result);
});
