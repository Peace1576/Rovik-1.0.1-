import { NextRequest, NextResponse } from "next/server";

import {
  createOAuthState,
  getAppOrigin,
  setOAuthStateCookie,
} from "@/lib/api-security";
import { createClient } from "@/lib/supabase/server";

// SmartThings consumer OAuth: authorization-code flow.
// Docs: https://developer.smartthings.com/docs/connected-services/hosting/authorization-code-flow
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
    .eq("service", "smartthings")
    .single();

  const config = (data?.config as Record<string, string>) ?? {};
  const clientId = config.client_id;

  if (!clientId) {
    const settingsUrl = new URL("/settings", appOrigin);
    settingsUrl.searchParams.set(
      "error",
      "Save your SmartThings client_id and client_secret in Settings first.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${appOrigin}/api/oauth/smartthings/callback`;
  const state = createOAuthState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // Narrow scopes — read devices + control switches/locks/thermostats.
    scope: "r:devices:* x:devices:* r:locations:*",
    state,
  });

  const response = NextResponse.redirect(
    `https://api.smartthings.com/oauth/authorize?${params.toString()}`,
  );
  setOAuthStateCookie(response, request, "smartthings", state);
  return response;
}
