import { randomBytes } from "node:crypto";
import type { RenderedPage, ThemeModel } from "./converter/types";
import { getStore } from "./storage";

/**
 * A job is one conversion: jobs/<id>/job.json plus the captured asset bytes
 * under jobs/<id>/assets/. Each job belongs to the browser session that
 * created it and expires after a week.
 */

export interface Job {
  id: string;
  owner: string;
  createdAt: string;
  source: { kind: "url" | "lovable"; label: string; url?: string; projectId?: string };
  model: ThemeModel;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(id)) throw new Error("Invalid id.");
  return id;
}

const jobKey = (id: string) => `jobs/${safeId(id)}/job.json`;
const assetKey = (id: string, assetId: string) => `jobs/${safeId(id)}/assets/${safeId(assetId)}`;

export async function createJob(owner: string, source: Job["source"], model: ThemeModel, pages: RenderedPage[]): Promise<Job> {
  const store = getStore();
  const id = randomBytes(9).toString("base64url");
  const written = new Set<string>();
  for (const page of pages) {
    for (const asset of page.assets) {
      if (written.has(asset.id)) continue;
      written.add(asset.id);
      await store.setBytes(assetKey(id, asset.id), Buffer.from(asset.base64, "base64"));
    }
  }
  const job: Job = { id, owner, createdAt: new Date().toISOString(), source, model };
  await store.setJSON(jobKey(id), job);
  void store.sweep("jobs/", MAX_AGE_MS);
  return job;
}

export async function loadJob(id: string, owner: string): Promise<Job | null> {
  let job: Job | null;
  try {
    job = await getStore().getJSON<Job>(jobKey(id));
  } catch {
    return null;
  }
  if (!job || job.owner !== owner) return null;
  if (Date.now() - Date.parse(job.createdAt) > MAX_AGE_MS) return null;
  return job;
}

export async function saveJob(job: Job): Promise<void> {
  await getStore().setJSON(jobKey(job.id), job);
}

export async function loadAssetBytes(job: Job): Promise<Map<string, Buffer>> {
  const store = getStore();
  const out = new Map<string, Buffer>();
  await Promise.all(
    job.model.assets.map(async (asset) => {
      const bytes = await store.getBytes(assetKey(job.id, asset.id));
      // Missing bytes: the theme falls back to the original URL.
      if (bytes) out.set(asset.id, bytes);
    }),
  );
  return out;
}
