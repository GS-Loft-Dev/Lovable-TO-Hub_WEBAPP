import { handle } from "@/lib/http";
import { loadAssetBytes } from "@/lib/jobs";
import { themeZip } from "@/lib/publish";
import { requireJob } from "@/lib/require-job";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const job = await requireJob(ctx);
  const zip = await themeZip(job.model, await loadAssetBytes(job));
  // Streamed: serverless hosts cap buffered responses (6 MB on Netlify).
  const chunk = 256 * 1024;
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= zip.length) return controller.close();
      controller.enqueue(new Uint8Array(zip.subarray(offset, offset + chunk)));
      offset += chunk;
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${job.model.name}.zip"`,
    },
  });
});
