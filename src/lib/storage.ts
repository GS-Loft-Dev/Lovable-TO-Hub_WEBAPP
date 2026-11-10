import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "./config";

/**
 * Tiny key/value store for jobs and their asset bytes.
 * - "fs": files under DATA_DIR (Docker, VPS, local dev);
 * - "netlify": Netlify Blobs, because function filesystems don't persist.
 */
export interface Store {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  getBytes(key: string): Promise<Buffer | null>;
  setBytes(key: string, value: Buffer): Promise<void>;
  /** Deletes every key under `prefix` older than `maxAgeMs`, best effort. */
  sweep(prefix: string, maxAgeMs: number): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9_\-./]+$/;

function checkKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
  return key;
}

class FsStore implements Store {
  private path(key: string) {
    return join(config.dataDir(), checkKey(key));
  }
  async getJSON<T>(key: string) {
    try {
      return JSON.parse(await readFile(this.path(key), "utf8")) as T;
    } catch {
      return null;
    }
  }
  async setJSON(key: string, value: unknown) {
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), JSON.stringify(value));
  }
  async getBytes(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }
  async setBytes(key: string, value: Buffer) {
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), value);
  }
  async sweep(prefix: string, maxAgeMs: number) {
    const dir = this.path(prefix.replace(/\/$/, ""));
    try {
      for (const name of await readdir(dir)) {
        const p = join(dir, name);
        if (Date.now() - (await stat(p)).mtimeMs > maxAgeMs) await rm(p, { recursive: true, force: true });
      }
    } catch {
      // Nothing to sweep.
    }
  }
}

class NetlifyStore implements Store {
  private storePromise: Promise<import("@netlify/blobs").Store> | null = null;
  private store() {
    this.storePromise ??= import("@netlify/blobs").then(({ getStore }) =>
      getStore({ name: "lovable-to-hubspot", consistency: "strong" }),
    );
    return this.storePromise;
  }
  async getJSON<T>(key: string) {
    return ((await (await this.store()).get(checkKey(key), { type: "json" })) as T | null) ?? null;
  }
  async setJSON(key: string, value: unknown) {
    await (await this.store()).setJSON(checkKey(key), value, { metadata: { createdAt: Date.now() } });
  }
  async getBytes(key: string) {
    const buf = await (await this.store()).get(checkKey(key), { type: "arrayBuffer" });
    return buf ? Buffer.from(buf) : null;
  }
  async setBytes(key: string, value: Buffer) {
    const copy = new Uint8Array(value).buffer;
    await (await this.store()).set(checkKey(key), copy, { metadata: { createdAt: Date.now() } });
  }
  async sweep(prefix: string, maxAgeMs: number) {
    try {
      const store = await this.store();
      const { blobs } = await store.list({ prefix });
      for (const { key } of blobs) {
        const meta = await store.getMetadata(key);
        const created = Number(meta?.metadata?.createdAt ?? 0);
        if (created && Date.now() - created > maxAgeMs) await store.delete(key);
      }
    } catch {
      // Best effort.
    }
  }
}

let instance: Store | null = null;

export function storageKind(): "fs" | "netlify" {
  const explicit = process.env.STORAGE?.trim().toLowerCase();
  if (explicit === "fs" || explicit === "netlify") return explicit;
  return process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT ? "netlify" : "fs";
}

export function getStore(): Store {
  instance ??= storageKind() === "netlify" ? new NetlifyStore() : new FsStore();
  return instance;
}
