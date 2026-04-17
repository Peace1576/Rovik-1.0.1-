import { NextRequest, NextResponse } from "next/server";

const CACHE_HEADERS = { "Cache-Control": "no-store" };
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

const INTEGRATION_FIELD_ALLOWLIST = {
  tavily: ["api_key"],
  openweather: ["api_key"],
  alphavantage: ["api_key"],
  newsapi: ["api_key"],
  resend: ["api_key", "from_email"],
  pushover: ["user_key", "app_token"],
  openai: ["api_key"],
  youtube: ["api_key"],
  homeassistant: ["url", "token"],
  google: ["client_id", "client_secret"],
  spotify: ["client_id", "client_secret"],
} as const;

type OAuthProvider = "google" | "spotify";
type IntegrationService = keyof typeof INTEGRATION_FIELD_ALLOWLIST;

export function jsonNoStore(
  body: unknown,
  init?: number | ResponseInit,
) {
  if (typeof init === "number") {
    return NextResponse.json(body, {
      status: init,
      headers: CACHE_HEADERS,
    });
  }

  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CACHE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

export function rejectCrossSiteRequest(request: NextRequest) {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return jsonNoStore({ error: "Forbidden" }, 403);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return jsonNoStore({ error: "Forbidden" }, 403);
  }

  return null;
}

export function getAppOrigin(request: NextRequest) {
  return request.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function isIntegrationService(value: string): value is IntegrationService {
  return Object.prototype.hasOwnProperty.call(INTEGRATION_FIELD_ALLOWLIST, value);
}

export function sanitizeIntegrationConfig(
  service: IntegrationService,
  config: unknown,
) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const allowedFields = INTEGRATION_FIELD_ALLOWLIST[service];
  const source = config as Record<string, unknown>;
  const sanitized: Record<string, string> = {};

  for (const key of Object.keys(source)) {
    if (!allowedFields.includes(key as never)) {
      return null;
    }
  }

  for (const field of allowedFields) {
    const rawValue = source[field];
    if (typeof rawValue !== "string") {
      return null;
    }

    const trimmed = rawValue.trim();
    if (!trimmed || trimmed.length > 4000) {
      return null;
    }

    sanitized[field] = trimmed;
  }

  return sanitized;
}

export function createOAuthState() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function getOAuthStateCookieName(provider: OAuthProvider) {
  return `eve-oauth-state-${provider}`;
}

export function setOAuthStateCookie(
  response: NextResponse,
  request: NextRequest,
  provider: OAuthProvider,
  state: string,
) {
  response.cookies.set(getOAuthStateCookieName(provider), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: `/api/oauth/${provider}`,
  });
}

export function clearOAuthStateCookie(
  response: NextResponse,
  request: NextRequest,
  provider: OAuthProvider,
) {
  response.cookies.set(getOAuthStateCookieName(provider), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 0,
    path: `/api/oauth/${provider}`,
  });
}
