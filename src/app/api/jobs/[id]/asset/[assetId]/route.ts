import { HttpError, handle } from "@/lib/http";
import { loadAssetBytes } from "@/lib/jobs";
import { requireJob } from "@/lib/require-job";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) => {
  const { assetId } = await ctx.params;
  const job = await requireJob(ctx);
  const asset = job.model.assets.find((a) => a.id === assetId);
  const bytes = asset && (await loadAssetBytes(job)).get(asset.id);
  if (!asset || !bytes) throw new HttpError(404, "Asset not found.");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": asset.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      // SVGs captured from a third-party page must not run scripts here.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
