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
    .eq("service", "spotify")
    .single();

  const config = (data?.config as Record<string, string>) ?? {};
  const clientId = config.client_id;

  if (!clientId) {
    const settingsUrl = new URL("/settings", appOrigin);
    settingsUrl.searchParams.set("error", "Save your Spotify client_id and client_secret in Settings first.");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${appOrigin}/api/oauth/spotify/callback`;
  const state = createOAuthState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing streaming",
    state,
  });

  const response = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  setOAuthStateCookie(response, request, "spotify", state);
  return response;
}
