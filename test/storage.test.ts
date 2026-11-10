import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "h2h-store-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE = "fs";
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe("filesystem store and jobs", () => {
  it("round-trips jobs and asset bytes, and isolates owners", async () => {
    const { createJob, loadJob, loadAssetBytes, saveJob } = await import("../src/lib/jobs");
    const model = {
      name: "t", label: "T", htmlLang: "en", bodyAttrs: "", headLinks: [], css: "", pages: [], modules: [], warnings: [],
      assets: [{ id: "a1", fileName: "a1-x.png", contentType: "image/png", sourceUrl: "https://x/x.png" }],
    };
    const page = { route: "/", url: "", title: "", html: "", css: "", headLinks: [], htmlLang: "en", bodyAttrs: "", assets: [{ ...model.assets[0], base64: Buffer.from("png!").toString("base64") }] };

    const job = await createJob("owner-1", { kind: "url", label: "x" }, model, [page]);
    expect(await loadJob(job.id, "someone-else")).toBeNull();
    const loaded = await loadJob(job.id, "owner-1");
    expect(loaded?.model.name).toBe("t");
    expect((await loadAssetBytes(loaded!)).get("a1")?.toString()).toBe("png!");

    loaded!.model.label = "Renamed";
    await saveJob(loaded!);
    expect((await loadJob(job.id, "owner-1"))?.model.label).toBe("Renamed");
  });

  it("rejects path traversal in keys and ids", async () => {
    const { getStore } = await import("../src/lib/storage");
    const { loadJob } = await import("../src/lib/jobs");
    await expect(getStore().setJSON("../escape.json", {})).rejects.toThrow(/Invalid storage key/);
    expect(await loadJob("../../etc", "owner-1")).toBeNull();
  });

  it("sweeps expired jobs", async () => {
    const { getStore } = await import("../src/lib/storage");
    await getStore().setJSON("jobs/old/job.json", {});
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    await utimes(join(dir, "jobs/old"), old, old);
    await getStore().sweep("jobs/", 7 * 24 * 3600 * 1000);
    expect(await getStore().getJSON("jobs/old/job.json")).toBeNull();
  });
});

describe("storage selection", () => {
  it("uses Netlify Blobs when running on Netlify", async () => {
    const { storageKind } = await import("../src/lib/storage");
    const prev = { STORAGE: process.env.STORAGE, NETLIFY: process.env.NETLIFY };
    delete process.env.STORAGE;
    process.env.NETLIFY = "true";
    expect(storageKind()).toBe("netlify");
    process.env.STORAGE = "fs";
    expect(storageKind()).toBe("fs");
    Object.assign(process.env, prev);
    if (prev.NETLIFY === undefined) delete process.env.NETLIFY;
  });
});
