import { NextRequest } from "next/server";

import {
  isIntegrationService,
  jsonNoStore,
  rejectCrossSiteRequest,
  sanitizeIntegrationConfig,
} from "@/lib/api-security";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonNoStore({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("user_integrations")
    .select("service, config, connected_at")
    .eq("user_id", user.id);

  if (error) return jsonNoStore({ error: error.message }, 500);

  // Mask secret values before returning to client
  const safe = (data ?? []).map((row) => ({
    service: row.service,
    connected_at: row.connected_at,
    fields: Object.keys(row.config as Record<string, unknown>),
  }));

  return jsonNoStore({ integrations: safe });
}

export async function POST(request: NextRequest) {
  const forbidden = rejectCrossSiteRequest(request);
  if (forbidden) return forbidden;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonNoStore({ error: "Unauthorized" }, 401);

  let body: { service?: unknown; config?: unknown };
  try {
    body = (await request.json()) as { service?: unknown; config?: unknown };
  } catch {
    return jsonNoStore({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.service !== "string" || !isIntegrationService(body.service)) {
    return jsonNoStore({ error: "Unsupported integration service." }, 400);
  }

  const sanitizedConfig = sanitizeIntegrationConfig(body.service, body.config);
  if (!sanitizedConfig) {
    return jsonNoStore({ error: "Invalid integration config payload." }, 400);
  }


  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: user.id,
      service: body.service,
      config: sanitizedConfig,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,service" }
  );

  if (error) return jsonNoStore({ error: error.message }, 500);
  return jsonNoStore({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const forbidden = rejectCrossSiteRequest(request);
  if (forbidden) return forbidden;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonNoStore({ error: "Unauthorized" }, 401);

  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service");
  if (!service || !isIntegrationService(service)) {
    return jsonNoStore({ error: "service required" }, 400);
  }

  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("service", service);

  if (error) return jsonNoStore({ error: error.message }, 500);
  return jsonNoStore({ ok: true });
}
