import { NextRequest, NextResponse } from "next/server";

import {
  clearOAuthStateCookie,
  getAppOrigin,
  getOAuthStateCookieName,
} from "@/lib/api-security";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const baseUrl = getAppOrigin(request);
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");
  const storedState = request.cookies.get(getOAuthStateCookieName("smartthings"))?.value;

  const redirectToSettings = (search: string) => {
    const response = NextResponse.redirect(`${baseUrl}/settings?${search}`);
    clearOAuthStateCookie(response, request, "smartthings");
    return response;
  };

  if (providerError) {
    return redirectToSettings(`error=${encodeURIComponent(`SmartThings OAuth failed: ${providerError}`)}`);
  }
  if (!code || !state || !storedState || state !== storedState) {
    return redirectToSettings("error=SmartThings+OAuth+state+validation+failed");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectToSettings("error=Sign+in+again+before+connecting+SmartThings");
  }

  const { data } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", user.id)
    .eq("service", "smartthings")
    .single();

  const config = (data?.config as Record<string, string>) ?? {};
  const { client_id, client_secret } = config;
  if (!client_id || !client_secret) {
    return redirectToSettings("error=SmartThings+client+credentials+missing");
  }

  const redirectUri = `${baseUrl}/api/oauth/smartthings/callback`;
  const credentials = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

  const tokenRes = await fetch("https://api.smartthings.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id,
    }),
  });

  if (!tokenRes.ok) {
    return redirectToSettings("error=SmartThings+token+exchange+failed");
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const newExpiry = Math.floor(Date.now() / 1000) + tokens.expires_in;
  const updatedConfig: Record<string, string> = {
    ...config,
    access_token: tokens.access_token,
    expires_at: String(newExpiry),
  };
  if (tokens.refresh_token) updatedConfig.refresh_token = tokens.refresh_token;

  await supabase
    .from("user_integrations")
    .update({ config: updatedConfig })
    .eq("user_id", user.id)
    .eq("service", "smartthings");

  return redirectToSettings("connected=smartthings");
}
