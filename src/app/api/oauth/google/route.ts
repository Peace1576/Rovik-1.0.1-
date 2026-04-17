import { NextRequest, NextResponse } from "next/server";

import {
  createOAuthState,
  getAppOrigin,
  setOAuthStateCookie,
} from "@/lib/api-security";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const appOrigin = getAppOrigin(request);

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", appOrigin));
  }

  const { data } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", user.id)
    .eq("service", "google")
    .single();

  const config = (data?.config as Record<string, string>) ?? {};
  const clientId = config.client_id;

  if (!clientId) {
    const settingsUrl = new URL("/settings", appOrigin);
    settingsUrl.searchParams.set("error", "Save your Google client_id and client_secret in Settings first.");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${appOrigin}/api/oauth/google/callback`;
  const state = createOAuthState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  setOAuthStateCookie(response, request, "google", state);
  return response;
}
