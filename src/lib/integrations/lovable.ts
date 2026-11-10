/**
 * Lovable API client (https://docs.lovable.dev/integrations/lovable-api).
 *
 * The API does not expose source code. We only need to list projects and to
 * mint an embed URL, which serves the latest preview build to an iframe on our
 * own origin; the renderer reads the page from there.
 */
import { config } from "../config";
import type { SessionData } from "../session";
import { isExpired, requestToken } from "./oauth";

export interface LovableProject {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  screenshotUrl: string | null;
  workspaceId: string;
  lastEditedAt: string | null;
}

export class LovableAuthError extends Error {}

type Auth = { kind: "oauth"; token: string } | { kind: "key"; key: string };

/** OAuth session first; the server-wide workspace API key as a fallback. */
export async function lovableAuth(session: SessionData & { save?: () => Promise<void> }): Promise<Auth | null> {
  if (session.lovable) {
    if (isExpired(session.lovable)) {
      if (!session.lovable.refreshToken) {
        delete session.lovable;
        await session.save?.();
        return lovableAuth(session);
      }
      session.lovable = await requestToken(config.lovable.tokenUrl(), {
        grant_type: "refresh_token",
        refresh_token: session.lovable.refreshToken,
        client_id: config.lovable.clientId(),
        client_secret: config.lovable.clientSecret(),
      });
      await session.save?.();
    }
    return { kind: "oauth", token: session.lovable.accessToken };
  }
  const key = config.lovable.apiKey();
  return key ? { kind: "key", key } : null;
}

async function call<T>(auth: Auth, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (auth.kind === "oauth") headers.set("authorization", `Bearer ${auth.token}`);
  else headers.set("Lovable-API-Key", auth.key);
  if (init.body) headers.set("content-type", "application/json");

  const res = await fetch(`${config.lovable.apiBase()}${path}`, { ...init, headers });
  if (res.status === 401) throw new LovableAuthError("Lovable session expired, please log in again.");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { title?: string; detail?: string; type?: string };
    const hint =
      res.status === 403
        ? " Check that the key or the OAuth client has the projects:read scope (sensitive scopes need a Business or Enterprise workspace)."
        : "";
    throw new Error(`Lovable API ${res.status}: ${body.detail ?? body.title ?? body.type ?? res.statusText}.${hint}`);
  }
  return (await res.json()) as T;
}

interface Page<T> {
  data: T[];
  pagination?: { next_cursor?: string | null };
}

interface RawWorkspace {
  id: string;
  name?: string | null;
}

interface RawProject {
  id: string;
  name?: string | null;
  description?: string | null;
  is_published?: boolean;
  latest_screenshot_url?: string | null;
  workspace_id: string;
  last_edited_at?: string | null;
}

export async function listWorkspaces(auth: Auth): Promise<{ id: string; name: string }[]> {
  const page = await call<Page<RawWorkspace>>(auth, "/v1/workspaces");
  return (page.data ?? []).map((w) => ({ id: w.id, name: w.name ?? w.id }));
}

export async function listProjects(auth: Auth, opts: { query?: string } = {}): Promise<LovableProject[]> {
  const workspaces = await listWorkspaces(auth);
  if (workspaces.length === 0) return [];
  const params = new URLSearchParams();
  for (const w of workspaces.slice(0, 10)) params.append("workspace_id", w.id);
  params.set("limit", "50");
  if (opts.query && opts.query.length >= 3) params.set("query", opts.query);
  const page = await call<Page<RawProject>>(auth, `/v1/projects?${params}`);
  return (page.data ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? "Untitled project",
    description: p.description ?? null,
    isPublished: Boolean(p.is_published),
    screenshotUrl: p.latest_screenshot_url ?? null,
    workspaceId: p.workspace_id,
    lastEditedAt: p.last_edited_at ?? null,
  }));
}

/** One-hour URL that loads the latest preview build inside an iframe on `parentOrigin`. */
export async function createEmbedUrl(auth: Auth, projectId: string, parentOrigin: string): Promise<string> {
  const res = await call<{ embed_url: string }>(auth, `/v1/projects/${encodeURIComponent(projectId)}/embed-url`, {
    method: "POST",
    body: JSON.stringify({ parent_origin: parentOrigin }),
  });
  return res.embed_url;
}
