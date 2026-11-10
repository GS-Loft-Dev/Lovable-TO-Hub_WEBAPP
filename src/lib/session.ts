import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { config } from "./config";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
}

export interface SessionData {
  /** Random id that owns the jobs created in this browser. */
  sid?: string;
  hubspot?: OAuthTokens & { portalId: number; hubDomain?: string };
  lovable?: OAuthTokens;
  oauth?: { provider: "hubspot" | "lovable"; state: string; verifier?: string; returnTo?: string };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), {
    password: config.sessionSecret(),
    cookieName: "h2h_session",
    cookieOptions: {
      secure: config.appUrl().startsWith("https://"),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  });
  if (!session.sid) {
    session.sid = randomBytes(16).toString("hex");
    await session.save();
  }
  return session;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
