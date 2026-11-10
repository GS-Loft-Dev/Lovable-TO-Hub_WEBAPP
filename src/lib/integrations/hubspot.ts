/**
 * HubSpot client: OAuth, File Manager uploads and the CMS Source Code API,
 * which writes theme files straight into the Design Manager.
 */
import { config } from "../config";
import type { SessionData } from "../session";
import { isExpired, requestToken } from "./oauth";

const API = "https://api.hubapi.com";
export const HUBSPOT_AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
export const HUBSPOT_TOKEN_URL = `${API}/oauth/v1/token`;

export class HubSpotAuthError extends Error {}

export interface HubSpotConnection {
  token: string;
  portalId: number;
  hubDomain?: string;
}

/** OAuth session first; a server-wide private app token as a fallback. */
export async function hubspotConnection(session: SessionData & { save?: () => Promise<void> }): Promise<HubSpotConnection | null> {
  const hs = session.hubspot;
  if (hs) {
    if (isExpired(hs) && hs.refreshToken) {
      const fresh = await requestToken(HUBSPOT_TOKEN_URL, {
        grant_type: "refresh_token",
        refresh_token: hs.refreshToken,
        client_id: config.hubspot.clientId(),
        client_secret: config.hubspot.clientSecret(),
      });
      session.hubspot = { ...hs, ...fresh, refreshToken: fresh.refreshToken ?? hs.refreshToken };
      await session.save?.();
    }
    return { token: session.hubspot!.accessToken, portalId: hs.portalId, hubDomain: hs.hubDomain };
  }
  const token = config.hubspot.accessToken();
  if (!token) return null;
  const details = await api<{ portalId: number; uiDomain?: string }>(token, "/account-info/v3/details");
  return { token, portalId: details.portalId, hubDomain: details.uiDomain };
}

/** Portal id and domain for a fresh OAuth access token. */
export async function tokenInfo(accessToken: string): Promise<{ portalId: number; hubDomain?: string }> {
  const res = await fetch(`${API}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`HubSpot token lookup failed (${res.status}).`);
  const body = (await res.json()) as { hub_id: number; hub_domain?: string };
  return { portalId: body.hub_id, hubDomain: body.hub_domain };
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 401) throw new HubSpotAuthError("HubSpot session expired, please log in again.");
  const text = await res.text();
  if (!res.ok) throw new Error(describeError(res.status, text));
  return (text ? JSON.parse(text) : {}) as T;
}

function describeError(status: number, text: string): string {
  try {
    const body = JSON.parse(text) as {
      message?: string;
      errors?: { message?: string; context?: Record<string, string[]> }[];
      validationResults?: { message?: string; lineNumber?: number }[];
    };
    const details = [
      ...(body.errors ?? []).map((e) => e.message).filter(Boolean),
      ...(body.validationResults ?? []).map((v) => (v.lineNumber ? `line ${v.lineNumber}: ${v.message}` : v.message)),
    ];
    const scopeHint = status === 403 ? " (missing scope? the app needs \"content\" and \"files\")" : "";
    return `HubSpot ${status}${scopeHint}: ${[body.message, ...details].filter(Boolean).join(" — ")}`;
  } catch {
    return `HubSpot ${status}: ${text.slice(0, 300)}`;
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function blobOf(content: string | Buffer, type: string): Blob {
  return new Blob([typeof content === "string" ? content : new Uint8Array(content)], { type });
}

function contentTypeFor(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html";
  return "application/octet-stream";
}

/** Uploads one file to the Design Manager (published environment). */
export async function putSourceFile(conn: HubSpotConnection, path: string, content: string | Buffer): Promise<void> {
  const form = new FormData();
  form.set("file", blobOf(content, contentTypeFor(path)), path.split("/").pop());
  await api(conn.token, `${config.hubspot.sourceCodeBase()}/published/content/${encodePath(path)}`, { method: "PUT", body: form });
}

/** Asks HubSpot to validate HubL/JSON before writing it. Throws with the errors. */
export async function validateSourceFile(conn: HubSpotConnection, path: string, content: string | Buffer): Promise<void> {
  const form = new FormData();
  form.set("file", blobOf(content, contentTypeFor(path)), path.split("/").pop());
  await api(conn.token, `${config.hubspot.sourceCodeBase()}/published/validate/${encodePath(path)}`, { method: "POST", body: form });
}

/** Uploads an image or font to the File Manager and returns its public URL. */
export async function uploadFile(
  conn: HubSpotConnection,
  file: { name: string; contentType: string; bytes: Buffer },
  folderPath: string,
): Promise<string> {
  const form = new FormData();
  form.set("file", blobOf(file.bytes, file.contentType), file.name);
  form.set("fileName", file.name);
  form.set("folderPath", folderPath);
  form.set("options", JSON.stringify({ access: "PUBLIC_NOT_INDEXABLE", overwrite: true, duplicateValidationStrategy: "NONE" }));
  const res = await api<{ url?: string; defaultHostingUrl?: string }>(conn.token, "/files/v3/files", { method: "POST", body: form });
  const url = res.url ?? res.defaultHostingUrl;
  if (!url) throw new Error(`HubSpot did not return a URL for ${file.name}.`);
  return url;
}

export function designManagerUrl(portalId: number): string {
  return `https://app.hubspot.com/design-manager/${portalId}`;
}
