import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { convertPages } from "@/lib/converter";
import { HttpError, handle } from "@/lib/http";
import { createEmbedUrl, lovableAuth } from "@/lib/integrations/lovable";
import { createJob } from "@/lib/jobs";
import { isAllowedUrl, isServerless, renderRoutes } from "@/lib/render";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  source: "url" | "lovable";
  url?: string;
  projectId?: string;
  projectName?: string;
  routes?: string[];
  themeName?: string;
}

function cleanRoutes(routes: string[] | undefined): string[] {
  const list = (routes ?? ["/"])
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => (r.startsWith("/") ? r : `/${r}`));
  const unique = [...new Set(list.length ? list : ["/"])];
  const max = Number(process.env.MAX_ROUTES) || (isServerless() ? 3 : 10);
  if (unique.length > max) throw new HttpError(400, `Up to ${max} pages per conversion on this server; convert the others separately.`);
  if (unique.some((r) => !/^\/[\w\-./~%]*$/.test(r))) throw new HttpError(400, "Routes must be plain paths like /about.");
  return unique;
}

export const POST = handle(async (req: Request) => {
  const session = await getSession();
  const body = (await req.json()) as Body;
  const routes = cleanRoutes(body.routes);

  let url: string;
  let embedParentOrigin: string | undefined;
  let label: string;

  if (body.source === "lovable") {
    if (!body.projectId) throw new HttpError(400, "Choose a project.");
    const auth = await lovableAuth(session);
    if (!auth) throw new HttpError(401, "Log in with Lovable first.");
    const origin = new URL(config.appUrl()).origin;
    if (!origin.startsWith("https://")) {
      throw new HttpError(400, "Lovable previews only load on an HTTPS origin: set APP_URL to the public https:// address of this app, or paste the published URL instead.");
    }
    url = await createEmbedUrl(auth, body.projectId, origin);
    embedParentOrigin = origin;
    label = body.projectName || body.projectId;
  } else {
    url = (body.url ?? "").trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    if (!isAllowedUrl(url)) throw new HttpError(400, "This server only converts Lovable sites (*.lovable.app). The admin can change RENDER_ALLOWED_HOSTS.");
    label = new URL(url).hostname;
  }

  const pages = await renderRoutes({ url, routes, embedParentOrigin });
  const themeName = body.themeName?.trim() || label.split(".")[0];
  const model = convertPages(pages, { themeName });
  const job = await createJob(
    session.sid!,
    { kind: body.source, label, url: body.source === "url" ? url : undefined, projectId: body.projectId },
    model,
    pages,
  );
  return NextResponse.json({ id: job.id });
});
