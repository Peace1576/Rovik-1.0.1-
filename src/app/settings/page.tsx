"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Integration = { service: string; connected_at: string; fields: string[] };

type ServiceDef = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  section: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  docsUrl?: string;
  oauthProvider?: "google" | "spotify" | "smartthings";
};

const SERVICES: ServiceDef[] = [
  // Web & Research
  {
    id: "tavily",
    label: "Tavily Search",
    emoji: "🔍",
    description: "Live web search built for AI — 1,000 free searches/month.",
    section: "Web & Research",
    fields: [{ key: "api_key", label: "API Key", placeholder: "tvly-xxxxxxxxxxxxxxxxxxxxxxxx" }],
    docsUrl: "https://app.tavily.com",
  },
  {
    id: "openweather",
    label: "OpenWeatherMap",
    emoji: "🌤",
    description: "Current weather and forecasts for any city.",
    section: "Web & Research",
    fields: [{ key: "api_key", label: "API Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
    docsUrl: "https://openweathermap.org/api",
  },
  {
    id: "alphavantage",
    label: "Alpha Vantage",
    emoji: "📈",
    description: "Real-time stock prices and market data.",
    section: "Web & Research",
    fields: [{ key: "api_key", label: "API Key", placeholder: "XXXXXXXXXXXXXXXX" }],
    docsUrl: "https://www.alphavantage.co/support/#api-key",
  },
  {
    id: "newsapi",
    label: "NewsAPI",
    emoji: "📰",
    description: "Latest headlines from 80,000+ sources.",
    section: "Web & Research",
    fields: [{ key: "api_key", label: "API Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
    docsUrl: "https://newsapi.org/register",
  },
  // Communication
  {
    id: "resend",
    label: "Resend Email",
    emoji: "📧",
    description: "Send emails on your behalf.",
    section: "Communication",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "re_xxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "from_email", label: "From Email", placeholder: "Eve <you@yourdomain.com>" },
    ],
    docsUrl: "https://resend.com/api-keys",
  },
  {
    id: "pushover",
    label: "Pushover",
    emoji: "📱",
    description: "Push notifications to your phone.",
    section: "Communication",
    fields: [
      { key: "user_key", label: "User Key", placeholder: "uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "app_token", label: "App Token", placeholder: "axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
    docsUrl: "https://pushover.net/apps/build",
  },
  // Media & Creation
  {
    id: "openai",
    label: "OpenAI (DALL-E 3)",
    emoji: "🎨",
    description: "Generate images with DALL-E 3.",
    section: "Media & Creation",
    fields: [{ key: "api_key", label: "API Key", placeholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "youtube",
    label: "YouTube Data API",
    emoji: "▶️",
    description: "Search YouTube videos and channels. Enable YouTube Data API v3 and allow this key to call it.",
    section: "Media & Creation",
    fields: [{ key: "api_key", label: "API Key", placeholder: "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
    docsUrl: "https://developers.google.com/youtube/registering_an_application",
  },
  // Smart Home
  {
    id: "homeassistant",
    label: "Home Assistant",
    emoji: "🏠",
    description: "Control your smart home devices via Home Assistant.",
    section: "Smart Home",
    fields: [
      { key: "url", label: "Home Assistant URL", placeholder: "http://homeassistant.local:8123", type: "text" },
      { key: "token", label: "Long-Lived Access Token", placeholder: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
    ],
    docsUrl: "https://www.home-assistant.io/docs/authentication/",
  },
  // Integrations
  {
    id: "google",
    label: "Google (Gmail + Calendar)",
    emoji: "🗓",
    description: "Read Gmail and manage Google Calendar events. Requires OAuth authorization after saving credentials.",
    section: "Integrations",
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "xxxxxxxxxxxxxx.apps.googleusercontent.com", type: "text" },
      { key: "client_secret", label: "Client Secret", placeholder: "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    oauthProvider: "google",
  },
  {
    id: "spotify",
    label: "Spotify",
    emoji: "🎵",
    description: "Search and control Spotify playback. Requires OAuth authorization after saving credentials.",
    section: "Integrations",
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text" },
      { key: "client_secret", label: "Client Secret", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
    docsUrl: "https://developer.spotify.com/dashboard",
    oauthProvider: "spotify",
  },
  {
    id: "smartthings",
    label: "SmartThings",
    emoji: "🏠",
    description: "Control Samsung SmartThings lights, locks, thermostats, and routines. Create a SmartThings API integration, then authorize via OAuth.",
    section: "Smart Home",
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "text" },
      { key: "client_secret", label: "Client Secret", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
    docsUrl: "https://developer.smartthings.com/workspace",
    oauthProvider: "smartthings",
  },
];

const SECTIONS = ["Web & Research", "Communication", "Media & Creation", "Smart Home", "Integrations"];

function SettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");

  const loadIntegrations = useCallback(async () => {
    const res = await fetch("/api/integrations");
    if (res.ok) {
      const data = (await res.json()) as { integrations: Integration[] };
      setIntegrations(data.integrations ?? []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      setUserEmail(user.email ?? "");
      setDisplayName(user.user_metadata?.display_name ?? "");
      await loadIntegrations();
      setLoading(false);
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isConnected(serviceId: string) {
    return integrations.some((i) => i.service === serviceId);
  }

  function hasOAuthToken(serviceId: string) {
    return integrations.find((i) => i.service === serviceId)?.fields?.includes("access_token") ?? false;
  }

  function setField(serviceId: string, key: string, value: string) {
    setFormValues((prev) => ({
      ...prev,
      [serviceId]: { ...(prev[serviceId] ?? {}), [key]: value },
    }));
  }

  async function saveIntegration(service: ServiceDef) {
    const config = formValues[service.id] ?? {};
    const hasValues = service.fields.every((f) => config[f.key]?.trim());
    if (!hasValues) {
      setSavedMsg((p) => ({ ...p, [service.id]: "Fill in all fields." }));
      return;
    }

    setSaving((p) => ({ ...p, [service.id]: true }));
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: service.id, config }),
    });

    setSaving((p) => ({ ...p, [service.id]: false }));
    if (res.ok) {
      setSavedMsg((p) => ({ ...p, [service.id]: "Connected ✓" }));
      await loadIntegrations();
      setFormValues((p) => ({ ...p, [service.id]: {} }));
    } else {
      setSavedMsg((p) => ({ ...p, [service.id]: "Save failed. Try again." }));
    }
    setTimeout(() => setSavedMsg((p) => ({ ...p, [service.id]: "" })), 3000);
  }

  async function disconnect(serviceId: string) {
    await fetch(`/api/integrations?service=${serviceId}`, { method: "DELETE" });
    await loadIntegrations();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[#5c718d] font-mono text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl flex flex-col gap-6">

        {/* Header */}
        <header className="glass-panel flex items-center justify-between rounded-[2rem] px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-[#5c718d]">
              Rovik / Settings
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
              Eve Connections
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/65 bg-white/65 px-4 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#47627f] transition hover:bg-white"
          >
            ← Back to Eve
          </Link>
        </header>

        {/* OAuth connection banner */}
        {connectedParam && (
          <div className="rounded-[1.6rem] border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-700">
            Successfully connected <strong>{connectedParam}</strong>. You can now use {connectedParam === "google" ? "Gmail and Google Calendar" : "Spotify"}.
          </div>
        )}
        {errorParam && (
          <div className="rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-600">
            {decodeURIComponent(errorParam)}
          </div>
        )}

        {/* Account */}
        <section className="glass-panel rounded-[2rem] px-5 py-5">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
            Account
          </p>
          <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-base font-medium text-[#09101d]">{displayName || "—"}</p>
              <p className="text-sm text-[#5c718d]">{userEmail}</p>
            </div>
            <button
              onClick={signOut}
              className="rounded-full border border-white/65 bg-white/65 px-4 py-1.5 text-sm text-[#47627f] transition hover:bg-white"
            >
              Sign out
            </button>
          </div>
        </section>

        {/* Memory — always on */}
        <section className="glass-panel rounded-[2rem] px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div className="flex-1">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                Memory & Notes
              </p>
              <p className="mt-0.5 text-sm text-[#31425a]">
                Notes, facts, and lists are always saved to your account — no setup needed.
              </p>
            </div>
            <span className="rounded-full bg-green-100 border border-green-200 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-green-700">
              Always on
            </span>
          </div>
        </section>

        {/* Integration sections */}
        {SECTIONS.map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#5c718d] px-1">
              {section}
            </p>

            {SERVICES.filter((s) => s.section === section).map((service) => {
              const connected = isConnected(service.id);
              const isSaving = saving[service.id];
              const msg = savedMsg[service.id];
              const vals = formValues[service.id] ?? {};
              const oauthAuthorized = connected && !!service.oauthProvider && hasOAuthToken(service.id);
              const needsOAuth = connected && !!service.oauthProvider && !hasOAuthToken(service.id);

              return (
                <div key={service.id} className="glass-panel rounded-[2rem] px-5 py-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{service.emoji}</span>
                      <div>
                        <p className="font-medium text-[#09101d]">{service.label}</p>
                        <p className="text-sm text-[#5c718d]">{service.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {connected && (
                        <span className="rounded-full bg-green-100 border border-green-200 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-green-700">
                          {oauthAuthorized ? "Connected ✓" : "Connected"}
                        </span>
                      )}
                      {service.docsUrl && (
                        <a
                          href={service.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[#0b74ff] hover:underline"
                        >
                          Get key ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="mt-4 flex flex-col gap-3">
                    {service.fields.map((field) => (
                      <div key={field.key} className="flex flex-col gap-1">
                        <label className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#5c718d]">
                          {field.label}
                        </label>
                        <input
                          type={field.type ?? "password"}
                          value={vals[field.key] ?? ""}
                          onChange={(e) => setField(service.id, field.key, e.target.value)}
                          placeholder={connected ? "••••••••••••• (already saved)" : field.placeholder}
                          className="rounded-[1.2rem] border border-white/70 bg-white/82 px-4 py-2.5 text-sm text-[#10213a] outline-none transition placeholder:text-[#9aacbf] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
                        />
                      </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveIntegration(service)}
                        disabled={isSaving}
                        className="flex-1 rounded-[1.2rem] bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(19,112,255,0.25)] transition hover:-translate-y-0.5 disabled:opacity-60"
                      >
                        {isSaving ? "Saving…" : connected ? "Update" : "Connect"}
                      </button>
                      {connected && (
                        <button
                          onClick={() => disconnect(service.id)}
                          className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-100"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>

                    {/* OAuth authorize button — shown when credentials saved but not yet authorized */}
                    {needsOAuth && (
                      <a
                        href={`/api/oauth/${service.oauthProvider}`}
                        className="block w-full rounded-[1.2rem] border border-[#0b74ff]/40 bg-[rgba(11,116,255,0.06)] px-4 py-2.5 text-center text-sm font-semibold text-[#0b74ff] transition hover:bg-[rgba(11,116,255,0.12)]"
                      >
                        Authorize with {service.oauthProvider === "google" ? "Google" : service.oauthProvider === "spotify" ? "Spotify" : "SmartThings"} →
                      </a>
                    )}

                    {msg && (
                      <p className={`text-sm font-medium ${msg.includes("✓") ? "text-green-600" : "text-red-500"}`}>
                        {msg}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[#5c718d] font-mono text-sm">Loading…</p>
      </main>
    }>
      <SettingsInner />
    </Suspense>
  );
}
