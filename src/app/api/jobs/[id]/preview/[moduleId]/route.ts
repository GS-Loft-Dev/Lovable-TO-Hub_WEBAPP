import { ASSET_SCHEME } from "@/lib/converter/types";
import { HttpError, handle } from "@/lib/http";
import { requireJob } from "@/lib/require-job";

export const dynamic = "force-dynamic";

/**
 * Renders one captured section with the page CSS, for the preview iframe.
 * Scripts are disabled by CSP: this markup comes from a third-party page.
 */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; moduleId: string }> }) => {
  const { moduleId } = await ctx.params;
  const job = await requireJob(ctx);
  const mod = job.model.modules.find((m) => m.id === moduleId);
  if (!mod) throw new HttpError(404, "Module not found.");

  const assetRe = new RegExp(`${ASSET_SCHEME}([A-Za-z0-9_-]+)`, "g");
  const resolve = (s: string) => s.replace(assetRe, (_m, id: string) => `/api/jobs/${job.id}/asset/${id}`);
  const page = job.model.pages.find((p) => p.layout.some((n) => (n.type === "static" ? n.moduleId === mod.id : n.moduleIds.includes(mod.id))));
  const wrappers = page?.wrapperOpen.join("") ?? "";
  const closers = page?.wrapperClose.join("") ?? "";

  const html = `<!doctype html>
<html lang="${job.model.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${job.model.headLinks.join("\n")}
<style>${resolve(job.model.css).replace(/<\/style/gi, "<\\/style")}</style>
<style>html,body{min-height:0!important} .fixed{position:relative!important}</style>
</head>
<body ${job.model.bodyAttrs}>${wrappers}${resolve(mod.previewHtml)}${closers}</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self' https: data:; script-src 'none'; style-src 'self' 'unsafe-inline' https:; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
});
