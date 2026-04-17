import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientAction } from "@/lib/eve-tools";

type ToolResult = {
  toolOutput: Record<string, unknown>;
  clientAction?: ClientAction;
};

type YouTubeVideoResult = {
  title: string;
  channel: string;
  videoId: string;
  url: string;
  published: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function getUserConfig(
  supabase: SupabaseClient,
  userId: string,
  service: string
): Promise<Record<string, string> | null> {
  if (!userId || userId === "anonymous") return null;
  const { data } = await supabase
    .from("user_integrations")
    .select("config")
    .eq("user_id", userId)
    .eq("service", service)
    .single();
  return (data?.config as Record<string, string>) ?? null;
}

function notConnected(service: string): ToolResult {
  return {
    toolOutput: {
      error: `${service} is not connected. Go to Settings to add your API key.`,
    },
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readGoogleApiError(res: Response) {
  try {
    const data = (await res.json()) as {
      error?: {
        message?: string;
        details?: Array<{
          reason?: string;
        }>;
      };
    };

    return {
      message: data.error?.message ?? `Google API request failed: ${res.status}`,
      reason: data.error?.details?.find((detail) => detail.reason)?.reason ?? null,
    };
  } catch {
    return {
      message: `Google API request failed: ${res.status}`,
      reason: null,
    };
  }
}

function getYouTubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function getYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function extractYouTubeVideoId(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "youtu.be") {
      const candidate = url.pathname.replace(/^\/+/, "").split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
    }

    const vParam = url.searchParams.get("v");
    if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam)) {
      return vParam;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const specialIndex = segments.findIndex((segment) => segment === "embed" || segment === "shorts");
    if (specialIndex >= 0) {
      const candidate = segments[specialIndex + 1] ?? "";
      return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
    }
  } catch {
    return null;
  }

  return null;
}

function youtubeSearchFallback(query: string, error: string): ToolResult {
  const fallbackUrl = getYouTubeSearchUrl(query);
  return {
    toolOutput: {
      error,
      fallback_url: fallbackUrl,
    },
    clientAction: {
      type: "open_url",
      url: fallbackUrl,
      description: `Search YouTube for ${query}`,
    },
  };
}

async function fetchYoutubeSearchResults(query: string, apiKey: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
        "x-goog-api-key": apiKey,
      },
    }
  );

  if (!res.ok) {
    const googleError = await readGoogleApiError(res);
    return {
      error: googleError.message,
      status: res.status,
      reason: googleError.reason,
    };
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: { videoId: string };
      snippet: { title: string; channelTitle: string; publishedAt: string };
    }>;
  };

  const results: YouTubeVideoResult[] = (data.items ?? []).map((item) => ({
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    videoId: item.id.videoId,
    url: getYouTubeWatchUrl(item.id.videoId),
    published: item.snippet.publishedAt?.slice(0, 10) ?? "",
  }));

  return { results };
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    normalized === "169.254.169.254" ||
    /^127\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    /^fc/i.test(normalized) ||
    /^fd/i.test(normalized) ||
    /^fe80:/i.test(normalized)
  );
}

function validateExternalUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: "Invalid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https URLs are supported." };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return { error: "Local and private network URLs are blocked." };
  }

  return { url: parsed.toString() };
}

// ── Tool implementations ───────────────────────────────────────────────────

async function webSearch(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "tavily");
  if (!cfg?.api_key) return notConnected("Tavily Search");

  const query = String(args.query ?? "");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: cfg.api_key, query, max_results: 5 }),
  });
  if (!res.ok) return { toolOutput: { error: `Search failed: ${res.status}` } };

  const data = (await res.json()) as {
    results?: Array<{ title: string; url: string; content: string }>;
  };
  const results = (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.content,
  }));
  return { toolOutput: { results } };
}

async function readPage(args: Record<string, unknown>): Promise<ToolResult> {
  const url = String(args.url ?? "");
  const validated = validateExternalUrl(url);
  if ("error" in validated) {
    return { toolOutput: { error: validated.error } };
  }

  try {
    const res = await fetch(validated.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EveBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const text = stripHtml(html).slice(0, 4000);
    return { toolOutput: { url: validated.url, text } };
  } catch (e) {
    return { toolOutput: { error: `Could not read page: ${(e as Error).message}` } };
  }
}

async function getWikipedia(args: Record<string, unknown>): Promise<ToolResult> {
  const topic = encodeURIComponent(String(args.topic ?? ""));
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${topic}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return { toolOutput: { error: "Topic not found on Wikipedia." } };
  const data = (await res.json()) as { extract: string; content_urls?: { desktop?: { page?: string } } };
  return {
    toolOutput: {
      summary: data.extract,
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${topic}`,
    },
  };
}

async function getWeather(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "openweather");
  if (!cfg?.api_key) return notConnected("OpenWeatherMap");

  const location = String(args.location ?? "");
  // Fetch metric; convert to imperial ourselves so Eve can use either unit
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${cfg.api_key}&units=metric`
  );
  if (!res.ok) return { toolOutput: { error: `Weather not found for "${location}".` } };

  const d = (await res.json()) as {
    main: { temp: number; feels_like: number; humidity: number };
    weather: Array<{ description: string }>;
    wind: { speed: number };
    name: string;
  };
  const toF = (c: number) => Math.round(c * 9 / 5 + 32);
  return {
    toolOutput: {
      location: d.name,
      temp_f: toF(d.main.temp),
      temp_c: Math.round(d.main.temp),
      feels_like_f: toF(d.main.feels_like),
      feels_like_c: Math.round(d.main.feels_like),
      humidity_pct: d.main.humidity,
      description: d.weather[0]?.description ?? "",
      wind_mph: Math.round(d.wind.speed * 2.237),
    },
  };
}

async function getStockPrice(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "alphavantage");
  if (!cfg?.api_key) return notConnected("Alpha Vantage");

  const symbol = String(args.symbol ?? "").toUpperCase();
  const res = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${cfg.api_key}`
  );
  const data = (await res.json()) as { "Global Quote": Record<string, string> };
  const q = data["Global Quote"];
  if (!q || !q["05. price"]) return { toolOutput: { error: `No data found for ${symbol}.` } };

  return {
    toolOutput: {
      symbol,
      price: parseFloat(q["05. price"]).toFixed(2),
      change: parseFloat(q["09. change"]).toFixed(2),
      change_percent: q["10. change percent"],
    },
  };
}

async function searchNews(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "newsapi");
  if (!cfg?.api_key) return notConnected("NewsAPI");

  const query = String(args.query ?? "");
  const res = await fetch(
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=5&sortBy=publishedAt&apiKey=${cfg.api_key}`
  );
  if (!res.ok) return { toolOutput: { error: "News search failed." } };

  const data = (await res.json()) as {
    articles: Array<{ title: string; source: { name: string }; url: string; publishedAt: string }>;
  };
  const articles = (data.articles ?? []).map((a) => ({
    title: a.title,
    source: a.source?.name,
    url: a.url,
    published: a.publishedAt?.slice(0, 10),
  }));
  return { toolOutput: { articles } };
}

async function currencyConvert(args: Record<string, unknown>): Promise<ToolResult> {
  const amount = Number(args.amount ?? 0);
  const from = String(args.from_currency ?? "USD").toUpperCase();
  const to = String(args.to_currency ?? "EUR").toUpperCase();

  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
  if (!res.ok) return { toolOutput: { error: "Currency data unavailable." } };

  const data = (await res.json()) as { rates: Record<string, number> };
  const rate = data.rates[to];
  if (!rate) return { toolOutput: { error: `Unknown currency: ${to}` } };

  return {
    toolOutput: {
      from,
      to,
      amount,
      converted: parseFloat((amount * rate).toFixed(4)),
      rate: parseFloat(rate.toFixed(6)),
    },
  };
}

// ── Memory tools ───────────────────────────────────────────────────────────

async function saveNote(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { error: "Sign in to save notes." } };
  }
  const { error } = await supabase.from("notes").insert({
    user_id: userId,
    content: String(args.content ?? ""),
    tag: String(args.tag ?? "general"),
  });
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { saved: true, tag: args.tag ?? "general" } };
}

async function getNotes(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { error: "Sign in to access notes." } };
  }
  let query = supabase
    .from("notes")
    .select("content, tag, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (args.tag) query = query.eq("tag", String(args.tag));

  const { data, error } = await query;
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { notes: data ?? [] } };
}

async function saveFactAboutMe(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { error: "Sign in to save personal facts." } };
  }
  const { error } = await supabase.from("user_facts").insert({
    user_id: userId,
    fact: String(args.fact ?? ""),
    category: String(args.category ?? "general"),
  });
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { saved: true } };
}

async function getFactsAboutMe(
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { facts: [] } };
  }
  const { data, error } = await supabase
    .from("user_facts")
    .select("fact, category, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { facts: data ?? [] } };
}

async function createList(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { error: "Sign in to create lists." } };
  }
  const items = Array.isArray(args.items) ? args.items : [];
  const { data, error } = await supabase
    .from("lists")
    .insert({ user_id: userId, name: String(args.name ?? ""), items })
    .select("id")
    .single();

  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { created: true, id: data?.id, name: args.name, items } };
}

async function getList(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { error: "Sign in to access lists." } };
  }
  const { data, error } = await supabase
    .from("lists")
    .select("name, items, updated_at")
    .eq("user_id", userId)
    .ilike("name", String(args.name ?? ""))
    .single();

  if (error) return { toolOutput: { error: `List not found: ${args.name}` } };
  return { toolOutput: { name: data.name, items: data.items } };
}

async function updateList(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  if (!userId || userId === "anonymous") {
    return { toolOutput: { error: "Sign in to update lists." } };
  }
  const { data, error } = await supabase
    .from("lists")
    .select("id, items")
    .eq("user_id", userId)
    .ilike("name", String(args.name ?? ""))
    .single();

  if (error) return { toolOutput: { error: `List not found: ${args.name}` } };

  const currentItems: string[] = Array.isArray(data.items) ? data.items : [];
  const item = String(args.item ?? "");
  let updatedItems: string[];

  if (args.operation === "add") {
    updatedItems = [...currentItems, item];
  } else {
    updatedItems = currentItems.filter((i) => i.toLowerCase() !== item.toLowerCase());
  }

  const { error: updateError } = await supabase
    .from("lists")
    .update({ items: updatedItems, updated_at: new Date().toISOString() })
    .eq("id", data.id);

  if (updateError) return { toolOutput: { error: updateError.message } };
  return { toolOutput: { updated: true, items: updatedItems } };
}

// ── Communication tools ────────────────────────────────────────────────────

async function sendEmail(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "resend");
  if (!cfg?.api_key) return notConnected("Resend Email");

  const from = cfg.from_email ?? "Eve <eve@rovik.app>";
  const bodyHtml = escapeHtml(String(args.body ?? "")).replace(/\n/g, "<br>");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [String(args.to ?? "")],
      subject: String(args.subject ?? ""),
      html: `<p>${bodyHtml}</p>`,
    }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    return { toolOutput: { error: err.message ?? "Email failed to send." } };
  }
  const data = (await res.json()) as { id: string };
  return { toolOutput: { sent: true, message_id: data.id } };
}

async function notifyPhone(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "pushover");
  if (!cfg?.user_key || !cfg?.app_token) return notConnected("Pushover");

  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: cfg.app_token,
      user: cfg.user_key,
      message: String(args.message ?? ""),
    }),
  });
  if (!res.ok) return { toolOutput: { error: "Pushover notification failed." } };
  return { toolOutput: { sent: true } };
}

// ── OAuth token helpers ────────────────────────────────────────────────────

async function getGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const cfg = await getUserConfig(supabase, userId, "google");
  if (!cfg?.access_token) return null;

  const expiresAt = Number(cfg.expires_at ?? 0);
  const nowSecs = Math.floor(Date.now() / 1000);

  if (expiresAt > nowSecs + 60) {
    return cfg.access_token;
  }

  // Token expired or expiring soon — refresh it
  if (!cfg.refresh_token || !cfg.client_id || !cfg.client_secret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: cfg.refresh_token,
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    const newExpiry = Math.floor(Date.now() / 1000) + data.expires_in;
    const updatedConfig = { ...cfg, access_token: data.access_token, expires_at: String(newExpiry) };
    await supabase
      .from("user_integrations")
      .update({ config: updatedConfig })
      .eq("user_id", userId)
      .eq("service", "google");
    return data.access_token;
  } catch {
    return null;
  }
}

async function getSpotifyAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const cfg = await getUserConfig(supabase, userId, "spotify");
  if (!cfg?.access_token) return null;

  const expiresAt = Number(cfg.expires_at ?? 0);
  const nowSecs = Math.floor(Date.now() / 1000);

  if (expiresAt > nowSecs + 60) {
    return cfg.access_token;
  }

  if (!cfg.refresh_token || !cfg.client_id || !cfg.client_secret) return null;

  try {
    const credentials = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: cfg.refresh_token,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    const newExpiry = Math.floor(Date.now() / 1000) + data.expires_in;
    const updatedConfig = { ...cfg, access_token: data.access_token, expires_at: String(newExpiry) };
    await supabase
      .from("user_integrations")
      .update({ config: updatedConfig })
      .eq("user_id", userId)
      .eq("service", "spotify");
    return data.access_token;
  } catch {
    return null;
  }
}

// ── New tool implementations ───────────────────────────────────────────────

async function searchYoutube(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const query = String(args.query ?? "");
  const cfg = await getUserConfig(supabase, userId, "youtube");

  if (!cfg?.api_key) {
    return youtubeSearchFallback(
      query,
      "YouTube (Data API v3) is not connected. I opened YouTube search results instead."
    );
  }

  const search = await fetchYoutubeSearchResults(query, cfg.api_key);
  if ("error" in search) {
    const serviceBlocked =
      search.status === 403 && search.reason === "API_KEY_SERVICE_BLOCKED";

    return youtubeSearchFallback(
      query,
      serviceBlocked
        ? "Your YouTube API key is blocked from calling YouTube Data API v3. In Google Cloud Console, enable YouTube Data API v3 and allow it under this key's API restrictions."
        : (search.error ?? "YouTube search failed."),
    );
  }

  return { toolOutput: { results: search.results } };
}

async function playYoutube(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const title = String(args.title ?? "").trim();
  const channel = String(args.channel ?? "").trim();
  const explicitVideoId =
    extractYouTubeVideoId(String(args.video_id ?? "")) ??
    extractYouTubeVideoId(String(args.url ?? ""));

  if (explicitVideoId) {
    const url = getYouTubeWatchUrl(explicitVideoId);
    return {
      toolOutput: {
        playing: true,
        title: title || "YouTube video",
        channel,
        videoId: explicitVideoId,
        url,
      },
      clientAction: {
        type: "play_youtube",
        videoId: explicitVideoId,
        url,
        title: title || "YouTube video",
        channel,
      },
    };
  }

  const query = String(args.query ?? title).trim();
  if (!query) {
    return { toolOutput: { error: "Provide a YouTube query, URL, or video ID to play." } };
  }

  const cfg = await getUserConfig(supabase, userId, "youtube");
  if (!cfg?.api_key) {
    return youtubeSearchFallback(
      query,
      "YouTube (Data API v3) is not connected. I opened YouTube search results instead."
    );
  }

  const search = await fetchYoutubeSearchResults(query, cfg.api_key);
  if ("error" in search) {
    const serviceBlocked =
      search.status === 403 && search.reason === "API_KEY_SERVICE_BLOCKED";

    return youtubeSearchFallback(
      query,
      serviceBlocked
        ? "Your YouTube API key is blocked from calling YouTube Data API v3. In Google Cloud Console, enable YouTube Data API v3 and allow it under this key's API restrictions."
        : (search.error ?? "YouTube search failed."),
    );
  }

  const firstResult = search.results[0];
  if (!firstResult) {
    return youtubeSearchFallback(query, `No YouTube videos found for "${query}".`);
  }

  return {
    toolOutput: {
      playing: true,
      title: firstResult.title,
      channel: firstResult.channel,
      videoId: firstResult.videoId,
      url: firstResult.url,
      published: firstResult.published,
    },
    clientAction: {
      type: "play_youtube",
      videoId: firstResult.videoId,
      url: firstResult.url,
      title: firstResult.title,
      channel: firstResult.channel,
    },
  };
}

async function generateImage(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "openai");
  if (!cfg?.api_key) return notConnected("OpenAI (DALL-E 3)");

  const prompt = String(args.prompt ?? "");
  const size = String(args.size ?? "1024x1024");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "dall-e-3", prompt, size, n: 1 }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    return { toolOutput: { error: err.error?.message ?? "Image generation failed." } };
  }

  const data = (await res.json()) as { data: Array<{ url: string }> };
  const imageUrl = data.data[0]?.url ?? "";

  return {
    toolOutput: { url: imageUrl, prompt },
    clientAction: { type: "show_image", url: imageUrl, prompt },
  };
}

async function homeAssistantAction(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const cfg = await getUserConfig(supabase, userId, "homeassistant");
  if (!cfg?.url || !cfg?.token) return notConnected("Home Assistant");

  const service = String(args.service ?? "");
  const entityId = String(args.entity_id ?? "");
  const extraData = args.data ? (JSON.parse(String(args.data)) as Record<string, unknown>) : {};

  const [domain, ...serviceParts] = service.split(".");
  const serviceName = serviceParts.join(".");

  const body: Record<string, unknown> = { entity_id: entityId, ...extraData };

  const res = await fetch(`${cfg.url}/api/services/${domain}/${serviceName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { toolOutput: { error: `Home Assistant error: ${res.status}` } };
  }

  return { toolOutput: { success: true, service, entity_id: entityId } };
}

async function readGmail(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getGoogleAccessToken(supabase, userId);
  if (!token) return notConnected("Gmail (Google account not connected or not authorized)");

  const maxResults = Number(args.max_results ?? 10);
  const label = String(args.label ?? "INBOX");

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=${encodeURIComponent(label)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return { toolOutput: { error: `Gmail error: ${listRes.status}` } };

  const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const messageIds = (listData.messages ?? []).slice(0, maxResults);

  const emails = await Promise.all(
    messageIds.map(async (msg) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) return null;
      const msgData = (await msgRes.json()) as {
        id: string;
        snippet: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const headers = msgData.payload?.headers ?? [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
      return {
        id: msgData.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msgData.snippet,
      };
    })
  );

  return { toolOutput: { emails: emails.filter(Boolean) } };
}

async function searchGmail(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getGoogleAccessToken(supabase, userId);
  if (!token) return notConnected("Gmail (Google account not connected or not authorized)");

  const query = String(args.query ?? "");
  const maxResults = Number(args.max_results ?? 10);

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return { toolOutput: { error: `Gmail search error: ${listRes.status}` } };

  const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const messageIds = (listData.messages ?? []).slice(0, maxResults);

  const emails = await Promise.all(
    messageIds.map(async (msg) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) return null;
      const msgData = (await msgRes.json()) as {
        id: string;
        snippet: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const headers = msgData.payload?.headers ?? [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
      return {
        id: msgData.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msgData.snippet,
      };
    })
  );

  return { toolOutput: { emails: emails.filter(Boolean), query } };
}

async function getCalendarEvents(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getGoogleAccessToken(supabase, userId);
  if (!token) return notConnected("Google Calendar (Google account not connected or not authorized)");

  const maxResults = Number(args.max_results ?? 10);
  const daysAhead = Number(args.days_ahead ?? 7);

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { toolOutput: { error: `Calendar error: ${res.status}` } };

  const data = (await res.json()) as {
    items?: Array<{
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      description?: string;
    }>;
  };

  const events = (data.items ?? []).map((e) => ({
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location ?? "",
    description: e.description ?? "",
  }));

  return { toolOutput: { events } };
}

async function createCalendarEvent(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getGoogleAccessToken(supabase, userId);
  if (!token) return notConnected("Google Calendar (Google account not connected or not authorized)");

  const title = String(args.title ?? "");
  const startTime = String(args.start_time ?? "");
  const endTime = String(args.end_time ?? "");
  const description = args.description ? String(args.description) : undefined;
  const location = args.location ? String(args.location) : undefined;

  const eventBody: Record<string, unknown> = {
    summary: title,
    start: { dateTime: startTime },
    end: { dateTime: endTime },
  };
  if (description) eventBody.description = description;
  if (location) eventBody.location = location;

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  );
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    return { toolOutput: { error: err.error?.message ?? `Calendar error: ${res.status}` } };
  }

  const data = (await res.json()) as { id: string; htmlLink: string };
  return { toolOutput: { created: true, eventId: data.id, link: data.htmlLink, title, start: startTime, end: endTime } };
}

async function spotifySearch(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getSpotifyAccessToken(supabase, userId);
  if (!token) return notConnected("Spotify");

  const query = String(args.query ?? "");
  const type = String(args.type ?? "track");

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { toolOutput: { error: `Spotify search failed: ${res.status}` } };

  const data = (await res.json()) as Record<string, {
    items?: Array<{ name: string; id: string; uri: string; artists?: Array<{ name: string }> }>;
  }>;

  const key = `${type}s`;
  const items = (data[key]?.items ?? []).map((item) => ({
    name: item.name,
    id: item.id,
    uri: item.uri,
    artists: item.artists?.map((a) => a.name).join(", ") ?? "",
  }));

  return { toolOutput: { results: items, type } };
}

async function spotifyPlay(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getSpotifyAccessToken(supabase, userId);
  if (!token) return notConnected("Spotify");

  const query = String(args.query ?? "");
  const type = String(args.type ?? "track");

  // Search first
  const searchRes = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) return { toolOutput: { error: `Spotify search failed: ${searchRes.status}` } };

  const searchData = (await searchRes.json()) as Record<string, {
    items?: Array<{ name: string; uri: string }>;
  }>;
  const key = `${type}s`;
  const firstItem = searchData[key]?.items?.[0];
  if (!firstItem) return { toolOutput: { error: `Nothing found for "${query}"` } };

  const playBody: Record<string, unknown> = type === "track"
    ? { uris: [firstItem.uri] }
    : { context_uri: firstItem.uri };

  const playRes = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(playBody),
  });

  if (playRes.status === 404) {
    return { toolOutput: { error: "No active Spotify device found. Open Spotify on any device first." } };
  }
  if (!playRes.ok && playRes.status !== 204) {
    return { toolOutput: { error: `Spotify play error: ${playRes.status}` } };
  }

  return { toolOutput: { playing: true, name: firstItem.name, uri: firstItem.uri, type } };
}

async function spotifyControl(
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const token = await getSpotifyAccessToken(supabase, userId);
  if (!token) return notConnected("Spotify");

  const command = String(args.command ?? "");

  const endpoints: Record<string, { method: string; path: string }> = {
    pause: { method: "PUT", path: "/me/player/pause" },
    resume: { method: "PUT", path: "/me/player/play" },
    next: { method: "POST", path: "/me/player/next" },
    previous: { method: "POST", path: "/me/player/previous" },
  };

  if (command === "set_volume") {
    const volume = Math.min(100, Math.max(0, Number(args.volume ?? 50)));
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 404) return { toolOutput: { error: "No active Spotify device." } };
    if (!res.ok && res.status !== 204) return { toolOutput: { error: `Spotify error: ${res.status}` } };
    return { toolOutput: { success: true, command, volume } };
  }

  const endpoint = endpoints[command];
  if (!endpoint) return { toolOutput: { error: `Unknown command: ${command}` } };

  const res = await fetch(`https://api.spotify.com/v1${endpoint.path}`, {
    method: endpoint.method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return { toolOutput: { error: "No active Spotify device." } };
  if (!res.ok && res.status !== 204) return { toolOutput: { error: `Spotify error: ${res.status}` } };
  return { toolOutput: { success: true, command } };
}

// ── Client-side actions ────────────────────────────────────────────────────

function writeClipboard(args: Record<string, unknown>): ToolResult {
  return {
    toolOutput: { queued: true },
    clientAction: { type: "write_clipboard", text: String(args.text ?? "") },
  };
}

function downloadFile(args: Record<string, unknown>): ToolResult {
  return {
    toolOutput: { queued: true },
    clientAction: {
      type: "download_file",
      filename: String(args.filename ?? "file.txt"),
      content: String(args.content ?? ""),
      mimeType: String(args.mimeType ?? "text/plain"),
    },
  };
}

function draftEmail(args: Record<string, unknown>): ToolResult {
  return {
    toolOutput: { drafted: true },
    clientAction: {
      type: "draft_email",
      to: String(args.to ?? ""),
      subject: String(args.subject ?? ""),
      body: String(args.body ?? ""),
    },
  };
}

// ── Home Operations ────────────────────────────────────────────────────────

async function addBill(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const row = {
    user_id: userId,
    name: String(args.name ?? "").trim(),
    amount: args.amount != null ? Number(args.amount) : null,
    currency: String(args.currency ?? "USD"),
    due_date: (args.due_date as string) || null,
    recurrence: (args.recurrence as string) || null,
    vendor: (args.vendor as string) || null,
    category: (args.category as string) || null,
    notes: (args.notes as string) || null,
    source: "manual",
  };
  if (!row.name) return { toolOutput: { error: "name required" } };
  const { data, error } = await supabase.from("bills").insert(row).select().single();
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { status: "saved", bill: data } };
}

async function getBills(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  let q = supabase.from("bills").select("*").eq("user_id", userId).order("due_date", { ascending: true });
  const status = (args.status as string) || "pending";
  if (status !== "all") q = q.eq("status", status);
  if (args.due_before) q = q.lte("due_date", args.due_before as string);
  const { data, error } = await q.limit(50);
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { bills: data ?? [] } };
}

async function markBillPaid(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  let q = supabase.from("bills").update({ status: "paid", updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (args.id) q = q.eq("id", args.id as string);
  else if (args.name) q = q.ilike("name", String(args.name));
  else return { toolOutput: { error: "id or name required" } };
  const { data, error } = await q.select();
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { status: "updated", bills: data ?? [] } };
}

async function addSubscription(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const row = {
    user_id: userId,
    name: String(args.name ?? "").trim(),
    amount: args.amount != null ? Number(args.amount) : null,
    currency: String(args.currency ?? "USD"),
    billing_cycle: (args.billing_cycle as string) || null,
    next_charge_date: (args.next_charge_date as string) || null,
    vendor: (args.vendor as string) || null,
    status: (args.status as string) || "active",
    notes: (args.notes as string) || null,
  };
  if (!row.name) return { toolOutput: { error: "name required" } };
  const { data, error } = await supabase.from("subscriptions").insert(row).select().single();
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { status: "saved", subscription: data } };
}

async function getSubscriptions(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  let q = supabase.from("subscriptions").select("*").eq("user_id", userId).order("next_charge_date", { ascending: true });
  if (args.status) q = q.eq("status", args.status as string);
  if (args.flagged_only) q = q.eq("flagged_for_review", true);
  const { data, error } = await q.limit(100);
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { subscriptions: data ?? [] } };
}

async function flagSubscriptionForCancel(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  let q = supabase.from("subscriptions").update({
    flagged_for_review: true,
    notes: args.reason ? `Flagged: ${args.reason}` : null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (args.id) q = q.eq("id", args.id as string);
  else if (args.name) q = q.ilike("name", String(args.name));
  else return { toolOutput: { error: "id or name required" } };
  const { data, error } = await q.select();
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { status: "flagged", subscriptions: data ?? [] } };
}

async function scanInboxForBills(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const token = await getGoogleAccessToken(supabase, userId);
  if (!token) return { toolOutput: { error: "Google not connected. Link it in Settings." } };
  const days = Number(args.days_back ?? 30);
  const q = encodeURIComponent(`newer_than:${days}d (invoice OR receipt OR "payment due" OR subscription OR renewal OR "auto-pay")`);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { toolOutput: { error: `Gmail ${res.status}` } };
  const list = await res.json() as { messages?: Array<{ id: string }> };
  const candidates: Array<{ id: string; from: string; subject: string; date: string; snippet: string }> = [];
  for (const m of (list.messages ?? []).slice(0, 15)) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) continue;
    const msg = await r.json() as { payload?: { headers?: Array<{ name: string; value: string }> }; snippet?: string };
    const h = Object.fromEntries((msg.payload?.headers ?? []).map(x => [x.name, x.value]));
    candidates.push({
      id: m.id,
      from: h.From ?? "",
      subject: h.Subject ?? "",
      date: h.Date ?? "",
      snippet: msg.snippet ?? "",
    });
  }
  return { toolOutput: { candidates, note: "Confirm any you want saved as bills or subscriptions." } };
}

async function addRoutine(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const row = {
    user_id: userId,
    name: String(args.name ?? "").trim(),
    schedule: (args.schedule as string) || null,
    steps: Array.isArray(args.steps) ? args.steps : [],
  };
  if (!row.name) return { toolOutput: { error: "name required" } };
  const { data, error } = await supabase.from("routines").insert(row).select().single();
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { status: "saved", routine: data } };
}

async function getRoutines(userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase.from("routines").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { routines: data ?? [] } };
}

async function getActionHistory(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  let q = supabase.from("action_history").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (args.status) q = q.eq("status", args.status as string);
  const { data, error } = await q.limit(Number(args.limit ?? 20));
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { actions: data ?? [] } };
}

async function confirmPendingAction(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const decision = String(args.decision ?? "").toLowerCase();
  if (decision !== "approve" && decision !== "deny") {
    return { toolOutput: { error: "decision must be 'approve' or 'deny'" } };
  }
  const { data, error } = await supabase.from("action_history").update({
    status: decision === "approve" ? "approved" : "denied",
    approved_at: decision === "approve" ? new Date().toISOString() : null,
  }).eq("user_id", userId).eq("id", args.action_id as string).select().single();
  if (error) return { toolOutput: { error: error.message } };
  return { toolOutput: { status: decision, action: data } };
}

async function getMorningBrief(args: Record<string, unknown>, userId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [billsRes, subsRes] = await Promise.all([
    supabase.from("bills").select("name,amount,currency,due_date,status").eq("user_id", userId).eq("status", "pending").lte("due_date", weekAhead).order("due_date", { ascending: true }).limit(10),
    supabase.from("subscriptions").select("name,amount,currency,next_charge_date,flagged_for_review").eq("user_id", userId).or("flagged_for_review.eq.true,next_charge_date.lte." + weekAhead).limit(10),
  ]);

  let weather: unknown = null;
  if (args.location) {
    const w = await getWeather({ location: args.location }, userId, supabase);
    weather = w.toolOutput;
  }

  let calendar: unknown = null;
  const token = await getGoogleAccessToken(supabase, userId);
  if (token) {
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 86400000).toISOString();
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=8`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const j = await r.json() as { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> };
      calendar = (j.items ?? []).map(e => ({ title: e.summary, start: e.start?.dateTime ?? e.start?.date }));
    }
  }

  return {
    toolOutput: {
      date: today,
      weather,
      calendar_today: calendar,
      bills_due_this_week: billsRes.data ?? [],
      subscriptions_to_watch: subsRes.data ?? [],
    },
  };
}

// ── Main dispatcher ────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  switch (name) {
    // Existing
    case "open_url":
      return {
        toolOutput: { status: "ok", opened: args.url },
        clientAction: { type: "open_url", url: String(args.url ?? ""), description: String(args.description ?? "") },
      };
    case "set_reminder":
      return {
        toolOutput: { status: "ok", scheduled_in_minutes: args.delay_minutes },
        clientAction: { type: "set_reminder", message: String(args.message ?? ""), delay_minutes: Number(args.delay_minutes ?? 5) },
      };

    // Web & Research
    case "web_search": return webSearch(args, userId, supabase);
    case "read_page": return readPage(args);
    case "get_wikipedia": return getWikipedia(args);
    case "get_weather": return getWeather(args, userId, supabase);
    case "get_stock_price": return getStockPrice(args, userId, supabase);
    case "search_news": return searchNews(args, userId, supabase);
    case "currency_convert": return currencyConvert(args);

    // Memory
    case "save_note": return saveNote(args, userId, supabase);
    case "get_notes": return getNotes(args, userId, supabase);
    case "save_fact_about_me": return saveFactAboutMe(args, userId, supabase);
    case "get_facts_about_me": return getFactsAboutMe(userId, supabase);
    case "create_list": return createList(args, userId, supabase);
    case "get_list": return getList(args, userId, supabase);
    case "update_list": return updateList(args, userId, supabase);

    // Communication
    case "send_email": return sendEmail(args, userId, supabase);
    case "notify_phone": return notifyPhone(args, userId, supabase);

    // Client-side
    case "draft_email": return draftEmail(args);
    case "write_clipboard": return writeClipboard(args);
    case "download_file": return downloadFile(args);

    // Media & Creation
    case "search_youtube": return searchYoutube(args, userId, supabase);
    case "play_youtube": return playYoutube(args, userId, supabase);
    case "generate_image": return generateImage(args, userId, supabase);

    // Smart Home
    case "home_assistant_action": return homeAssistantAction(args, userId, supabase);

    // Gmail
    case "read_gmail": return readGmail(args, userId, supabase);
    case "search_gmail": return searchGmail(args, userId, supabase);

    // Google Calendar
    case "get_calendar_events": return getCalendarEvents(args, userId, supabase);
    case "create_calendar_event": return createCalendarEvent(args, userId, supabase);

    // Spotify
    case "spotify_search": return spotifySearch(args, userId, supabase);
    case "spotify_play": return spotifyPlay(args, userId, supabase);
    case "spotify_control": return spotifyControl(args, userId, supabase);

    // Home Operations
    case "get_morning_brief": return getMorningBrief(args, userId, supabase);
    case "add_bill": return addBill(args, userId, supabase);
    case "get_bills": return getBills(args, userId, supabase);
    case "mark_bill_paid": return markBillPaid(args, userId, supabase);
    case "add_subscription": return addSubscription(args, userId, supabase);
    case "get_subscriptions": return getSubscriptions(args, userId, supabase);
    case "flag_subscription_for_cancel": return flagSubscriptionForCancel(args, userId, supabase);
    case "scan_inbox_for_bills": return scanInboxForBills(args, userId, supabase);
    case "add_routine": return addRoutine(args, userId, supabase);
    case "get_routines": return getRoutines(userId, supabase);
    case "get_action_history": return getActionHistory(args, userId, supabase);
    case "confirm_pending_action": return confirmPendingAction(args, userId, supabase);

    default:
      return { toolOutput: { error: `Unknown tool: ${name}` } };
  }
}
