import type { ClientAction } from "@/lib/eve-tools";

type PendingMediaSource = "youtube" | "spotify";
type PendingMediaMode = "choose" | "confirm";

export type PendingMediaItem = {
  title: string;
  channel?: string;
  videoId?: string;
  url?: string;
  id?: string;
  uri?: string;
  artists?: string;
};

export type PendingMediaSelection = {
  source: PendingMediaSource;
  mode: PendingMediaMode;
  query: string;
  items: PendingMediaItem[];
  updatedAt: string;
};

export type ConversationState = {
  pendingMediaSelection: PendingMediaSelection | null;
};

export type ToolExecutionEvent = {
  name: string;
  args: Record<string, unknown>;
  toolOutput: Record<string, unknown>;
  clientAction?: ClientAction;
};

const EMPTY_STATE: ConversationState = {
  pendingMediaSelection: null,
};

function sanitizeMediaItem(value: unknown): PendingMediaItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim().slice(0, 300) : "";
  if (!title) return null;

  return {
    title,
    channel: typeof row.channel === "string" ? row.channel.trim().slice(0, 200) : undefined,
    videoId: typeof row.videoId === "string" ? row.videoId.trim().slice(0, 50) : undefined,
    url: typeof row.url === "string" ? row.url.trim().slice(0, 500) : undefined,
    id: typeof row.id === "string" ? row.id.trim().slice(0, 100) : undefined,
    uri: typeof row.uri === "string" ? row.uri.trim().slice(0, 300) : undefined,
    artists: typeof row.artists === "string" ? row.artists.trim().slice(0, 200) : undefined,
  };
}

export function normalizeConversationState(value: unknown): ConversationState {
  if (!value || typeof value !== "object") return EMPTY_STATE;

  const root = value as Record<string, unknown>;
  const pending = root.pendingMediaSelection;
  if (!pending || typeof pending !== "object") return EMPTY_STATE;

  const row = pending as Record<string, unknown>;
  const source = row.source === "youtube" || row.source === "spotify" ? row.source : null;
  if (!source) return EMPTY_STATE;

  const mode = row.mode === "confirm" ? "confirm" : "choose";
  const query = typeof row.query === "string" ? row.query.trim().slice(0, 300) : "";
  const items = Array.isArray(row.items)
    ? row.items.map(sanitizeMediaItem).filter((item): item is PendingMediaItem => Boolean(item)).slice(0, 5)
    : [];

  if (items.length === 0) return EMPTY_STATE;

  return {
    pendingMediaSelection: {
      source,
      mode,
      query,
      items,
      updatedAt:
        typeof row.updatedAt === "string" && row.updatedAt.trim()
          ? row.updatedAt.trim().slice(0, 80)
          : new Date().toISOString(),
    },
  };
}

function isAffirmativeReply(text: string) {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return false;

  const explicit = [
    "yes",
    "yes.",
    "yes!",
    "yes please",
    "yes, please",
    "yes yes",
    "yep",
    "yeah",
    "sure",
    "do it",
    "play it",
    "play that",
    "play that one",
    "that one",
    "the one you found",
    "i would like you to play it",
    "i would like to play it",
    "go ahead",
  ];

  if (explicit.includes(normalized)) return true;
  if (/^(yes|yeah|yep|sure|okay|ok)\b/.test(normalized)) return true;
  return /\b(play|watch|open)\s+(it|that|that one|the video)\b/.test(normalized);
}

function cleanComparableText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractSelectionIndex(text: string, itemCount: number) {
  const normalized = text.toLowerCase();

  if (/\bfirst\b/.test(normalized) || /\b1st\b/.test(normalized) || /\boption 1\b/.test(normalized)) return 0;
  if (/\bsecond\b/.test(normalized) || /\b2nd\b/.test(normalized) || /\boption 2\b/.test(normalized)) return 1;
  if (/\bthird\b/.test(normalized) || /\b3rd\b/.test(normalized) || /\boption 3\b/.test(normalized)) return 2;
  if (/\blast\b/.test(normalized)) return itemCount - 1;

  const numberMatch = normalized.match(/\b([1-5])\b/);
  if (numberMatch) {
    const asIndex = Number(numberMatch[1]) - 1;
    if (asIndex >= 0 && asIndex < itemCount) return asIndex;
  }

  return null;
}

type ResolvedPendingMedia =
  | { kind: "selection"; index: number; item: PendingMediaItem }
  | { kind: "affirmation"; index: number; item: PendingMediaItem }
  | { kind: "title_match"; index: number; item: PendingMediaItem };

function resolvePendingMediaReply(
  pending: PendingMediaSelection,
  latestUserMessage: string,
): ResolvedPendingMedia | null {
  const trimmed = latestUserMessage.trim();
  if (!trimmed) return null;

  const index = extractSelectionIndex(trimmed, pending.items.length);
  if (index != null && pending.items[index]) {
    return { kind: "selection", index, item: pending.items[index] };
  }

  const comparableMessage = cleanComparableText(trimmed);
  if (comparableMessage) {
    const matchedIndex = pending.items.findIndex((item) => {
      const comparableTitle = cleanComparableText(item.title);
      if (comparableTitle && comparableMessage.includes(comparableTitle)) return true;
      const comparableChannel = cleanComparableText(item.channel ?? item.artists ?? "");
      return comparableChannel ? comparableMessage.includes(comparableChannel) : false;
    });

    if (matchedIndex >= 0) {
      return { kind: "title_match", index: matchedIndex, item: pending.items[matchedIndex] };
    }
  }

  if (pending.items.length === 1 && isAffirmativeReply(trimmed)) {
    return { kind: "affirmation", index: 0, item: pending.items[0] };
  }

  return null;
}

function looksLikeStandaloneRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  if (tokenCount <= 4) return false;

  return (
    /\b(can you|could you|please|search|find|look up|show me|play|watch|open)\b/.test(normalized) &&
    !isAffirmativeReply(normalized) &&
    !/\b(first|second|third|last|that one|the one)\b/.test(normalized)
  );
}

function formatPendingItem(item: PendingMediaItem, index: number) {
  const byline = item.channel || item.artists ? ` by ${item.channel ?? item.artists}` : "";
  const locator = item.videoId
    ? `videoId=${item.videoId}`
    : item.uri
      ? `uri=${item.uri}`
      : item.url
        ? `url=${item.url}`
        : "";
  return `${index + 1}. "${item.title}"${byline}${locator ? ` (${locator})` : ""}`;
}

export function buildConversationContextInstruction(
  state: ConversationState,
  latestUserMessage: string,
) {
  const pending = state.pendingMediaSelection;
  if (!pending) return null;

  const resolved = resolvePendingMediaReply(pending, latestUserMessage);
  if (!resolved && looksLikeStandaloneRequest(latestUserMessage)) {
    return null;
  }
  const options = pending.items.map(formatPendingItem).join("\n");

  if (resolved) {
    const action =
      pending.source === "youtube"
        ? `Call play_youtube with this exact item if playback is appropriate.`
        : `Call spotify_play using this exact item if playback is appropriate.`;

    return [
      "STRUCTURED TURN CONTEXT:",
      `Eve is waiting for a ${pending.source} media response from the user.`,
      `Pending mode: ${pending.mode}.`,
      `Available options:\n${options}`,
      `The user's latest reply resolves to option ${resolved.index + 1}: "${resolved.item.title}".`,
      action,
      "Do not ask what the user means if this resolved reference is sufficient.",
    ].join("\n");
  }

  return [
    "STRUCTURED TURN CONTEXT:",
    `There is an unresolved pending ${pending.source} media question from the prior turn.`,
    `Pending mode: ${pending.mode}.`,
    `Available options:\n${options}`,
    "Interpret short replies like 'yes', 'play it', 'that one', or ordinal references against these options before asking the user to restate them.",
  ].join("\n");
}

export function getResolvedPendingMedia(
  state: ConversationState,
  latestUserMessage: string,
) {
  const pending = state.pendingMediaSelection;
  if (!pending) return null;
  return resolvePendingMediaReply(pending, latestUserMessage);
}

export function deriveConversationState(
  previousState: ConversationState,
  events: ToolExecutionEvent[],
): ConversationState {
  const nextState: ConversationState = {
    pendingMediaSelection: previousState.pendingMediaSelection,
  };

  for (const event of events) {
    if (event.name === "search_youtube") {
      const results = Array.isArray(event.toolOutput.results)
        ? event.toolOutput.results.map(sanitizeMediaItem).filter((item): item is PendingMediaItem => Boolean(item))
        : [];

      if (results.length > 0) {
        nextState.pendingMediaSelection = {
          source: "youtube",
          mode: results.length === 1 ? "confirm" : "choose",
          query: String(event.args.query ?? "").slice(0, 300),
          items: results,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    if (event.name === "play_youtube") {
      nextState.pendingMediaSelection = null;
    }

    if (event.name === "spotify_search") {
      const results = Array.isArray(event.toolOutput.results)
        ? event.toolOutput.results.map(sanitizeMediaItem).filter((item): item is PendingMediaItem => Boolean(item))
        : [];

      if (results.length > 0) {
        nextState.pendingMediaSelection = {
          source: "spotify",
          mode: results.length === 1 ? "confirm" : "choose",
          query: String(event.args.query ?? "").slice(0, 300),
          items: results,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    if (event.name === "spotify_play") {
      nextState.pendingMediaSelection = null;
    }
  }

  return nextState;
}
