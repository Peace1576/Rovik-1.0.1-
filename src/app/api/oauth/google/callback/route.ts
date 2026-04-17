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
  const storedState = request.cookies.get(getOAuthStateCookieName("google"))?.value;

  const redirectToSettings = (search: string) => {
    const response = NextResponse.redirect(`${baseUrl}/settings?${search}`);
    clearOAuthStateCookie(response, request, "google");
    return response;
  };

  if (providerError) {
    return redirectToSettings(`error=${encodeURIComponent(`Google OAuth failed: ${providerError}`)}`);
  }

  if (!code || !state || !storedState || state !== storedState) {
    return redirectToSettings("error=Google+OAuth+state+validation+failed");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToSettings("error=Sign+in+again+before+connecting+Google");
  }

  // Fetch the stored config to get client credentials
  const { data } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", user.id)
    .eq("service", "google")
    .single();

  const config = (data?.config as Record<string, string>) ?? {};
  const { client_id, client_secret } = config;

  if (!client_id || !client_secret) {
    return redirectToSettings("error=Google+client+credentials+missing");
  }

  const redirectUri = `${baseUrl}/api/oauth/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return redirectToSettings("error=Google+token+exchange+failed");
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
  if (tokens.refresh_token) {
    updatedConfig.refresh_token = tokens.refresh_token;
  }

  await supabase
    .from("user_integrations")
    .update({ config: updatedConfig })
    .eq("user_id", user.id)
    .eq("service", "google");

  return redirectToSettings("connected=google");
}
