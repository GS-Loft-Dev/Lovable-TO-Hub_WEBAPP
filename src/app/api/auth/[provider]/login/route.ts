import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { HttpError, handle } from "@/lib/http";
import { HUBSPOT_AUTHORIZE_URL } from "@/lib/integrations/hubspot";
import { pkceChallenge } from "@/lib/integrations/oauth";
import { getSession, randomToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  const session = await getSession();
  const state = randomToken();
  const redirectUri = `${config.appUrl()}/api/auth/${provider}/callback`;

  if (provider === "hubspot") {
    if (!config.hubspot.oauthEnabled()) throw new HttpError(400, "HubSpot OAuth is not configured on this server.");
    session.oauth = { provider, state };
    await session.save();
    const url = new URL(HUBSPOT_AUTHORIZE_URL);
    url.searchParams.set("client_id", config.hubspot.clientId());
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", config.hubspot.scopes());
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  }

  if (provider === "lovable") {
    if (!config.lovable.oauthEnabled()) throw new HttpError(400, "Lovable OAuth is not configured on this server.");
    const verifier = randomToken(48);
    session.oauth = { provider, state, verifier };
    await session.save();
    const url = new URL(config.lovable.authorizeUrl());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.lovable.clientId());
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", config.lovable.scopes());
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", pkceChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return NextResponse.redirect(url);
  }

  throw new HttpError(404, "Unknown provider.");
});
