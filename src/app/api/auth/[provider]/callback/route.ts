import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { HttpError, handle } from "@/lib/http";
import { HUBSPOT_TOKEN_URL, tokenInfo } from "@/lib/integrations/hubspot";
import { requestToken } from "@/lib/integrations/oauth";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const session = await getSession();
  const pending = session.oauth;
  delete session.oauth;

  const back = (status: string) => {
    const url = new URL("/", config.appUrl());
    url.searchParams.set("auth", `${provider}:${status}`);
    return NextResponse.redirect(url);
  };

  if (params.get("error")) {
    await session.save();
    return back("denied");
  }
  const code = params.get("code");
  if (!code || !pending || pending.provider !== provider || pending.state !== params.get("state")) {
    await session.save();
    throw new HttpError(400, "Invalid or expired login attempt, please try again.");
  }
  const redirectUri = `${config.appUrl()}/api/auth/${provider}/callback`;

  if (provider === "hubspot") {
    const tokens = await requestToken(HUBSPOT_TOKEN_URL, {
      grant_type: "authorization_code",
      client_id: config.hubspot.clientId(),
      client_secret: config.hubspot.clientSecret(),
      redirect_uri: redirectUri,
      code,
    });
    const info = await tokenInfo(tokens.accessToken);
    session.hubspot = { ...tokens, ...info };
  } else if (provider === "lovable") {
    session.lovable = await requestToken(config.lovable.tokenUrl(), {
      grant_type: "authorization_code",
      client_id: config.lovable.clientId(),
      client_secret: config.lovable.clientSecret(),
      redirect_uri: redirectUri,
      code,
      code_verifier: pending.verifier ?? "",
    });
  } else {
    throw new HttpError(404, "Unknown provider.");
  }

  await session.save();
  return back("ok");
});
