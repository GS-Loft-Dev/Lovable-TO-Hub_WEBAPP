import { createHash } from "node:crypto";
import type { OAuthTokens } from "../session";

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Standard OAuth 2.0 token request (authorization_code or refresh_token). */
export async function requestToken(tokenUrl: string, params: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { message?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Token request failed (${res.status}): ${body.error_description ?? body.message ?? "no access token"}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
  };
}

export function isExpired(tokens: OAuthTokens, skewMs = 60_000): boolean {
  return Boolean(tokens.expiresAt && tokens.expiresAt - skewMs < Date.now());
}
