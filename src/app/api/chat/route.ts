import { GoogleGenAI, Content, Part } from "@google/genai";
import { NextRequest } from "next/server";

import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/api-security";
import {
  buildConversationContextInstruction,
  deriveConversationState,
  getPendingMediaCorrection,
  getResolvedPendingMedia,
  normalizeConversationState,
  shouldResetPendingMediaSelection,
  type ToolExecutionEvent,
} from "@/lib/conversation-state";
import { eveSystemPrompt } from "@/lib/eve-system-prompt";
import { ClientAction, EVE_FUNCTION_DECLARATIONS } from "@/lib/eve-tools";
import { executeTool } from "@/lib/tool-executor";
import { createClient } from "@/lib/supabase/server";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient)
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return geminiClient;
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("role" in entry) ||
        !("content" in entry)
      )
        return [];
      const { role, content } = entry as Record<string, unknown>;
      if (
        (role !== "user" && role !== "assistant") ||
        typeof content !== "string"
      )
        return [];
      const trimmed = content.trim().slice(0, 4000);
      if (!trimmed) return [];
      return [{ role, content: trimmed }] as ChatMessage[];
    })
    .slice(-16);
}

function buildContents(messages: ChatMessage[]): Content[] {
  return messages.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));
}

function buildOfflineReply(input: string) {
  return `I'm running in offline demo mode because GEMINI_API_KEY is missing. Add that environment variable and I'll answer live. For now, start by clarifying the goal behind: "${input}"`;
}

function formatMediaSearchReply(
  source: "youtube" | "spotify",
  query: string,
  toolOutput: Record<string, unknown>,
) {
  if (toolOutput.error) {
    return String(toolOutput.error);
  }

  const results = Array.isArray(toolOutput.results)
    ? (toolOutput.results as Array<Record<string, unknown>>)
    : [];

  if (results.length === 0) {
    return source === "youtube"
      ? `I couldn't find any YouTube results for "${query}".`
      : `I couldn't find any Spotify results for "${query}".`;
  }

  const label = source === "youtube" ? "video" : "result";
  if (results.length === 1) {
    const first = results[0];
    const title = String(first.title ?? first.name ?? "that");
    const byline = String(first.channel ?? first.artists ?? "").trim();
    return byline
      ? `I found one ${label}: "${title}" by ${byline}. Do you want me to play it?`
      : `I found one ${label}: "${title}". Do you want me to play it?`;
  }

  const formatted = results
    .slice(0, 3)
    .map((item, index) => {
      const title = String(item.title ?? item.name ?? "Untitled");
      const byline = String(item.channel ?? item.artists ?? "").trim();
      return byline
        ? `${index + 1}. "${title}" by ${byline}`
        : `${index + 1}. "${title}"`;
    })
    .join("\n");

  return `Here are a few ${source} results for "${query}":\n${formatted}\n\nWhich one would you like?`;
}

export async function POST(request: NextRequest) {
  try {
    const forbidden = rejectCrossSiteRequest(request);
    if (forbidden) return forbidden;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return jsonNoStore({ error: "Expected application/json." }, 415);
    }

    // Get user session (anonymous users still work, just without memory/integrations)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? "anonymous";

    let body: { messages?: unknown; state?: unknown };
    try {
      body = (await request.json()) as { messages?: unknown; state?: unknown };
    } catch {
      return jsonNoStore({ error: "Invalid JSON body." }, 400);
    }
    const messages = sanitizeMessages(body.messages);
    const normalizedState = normalizeConversationState(body.state);
    const latestUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    if (!latestUserMessage) {
      return jsonNoStore(
        { error: "Send a prompt for Eve to respond to." },
        400,
      );
    }

    const activeConversationState = shouldResetPendingMediaSelection(
      normalizedState,
      latestUserMessage,
    )
      ? { pendingMediaSelection: null }
      : normalizedState;

    const resolvedPendingMedia = getResolvedPendingMedia(
      activeConversationState,
      latestUserMessage,
    );

    if (resolvedPendingMedia && activeConversationState.pendingMediaSelection) {
      const pending = activeConversationState.pendingMediaSelection;
      const item = resolvedPendingMedia.item;
      const toolName = pending.source === "youtube" ? "play_youtube" : "spotify_play";
      const toolArgs =
        pending.source === "youtube"
          ? {
              video_id: item.videoId ?? "",
              url: item.url ?? "",
              title: item.title,
              channel: item.channel ?? "",
            }
          : {
              query: [item.title, item.artists].filter(Boolean).join(" "),
              type: "track",
            };

      const { toolOutput, clientAction } = await executeTool(
        toolName,
        toolArgs,
        userId,
        supabase,
      );

      const actions = clientAction ? [clientAction] : [];
      const toolEvents: ToolExecutionEvent[] = [
        {
          name: toolName,
          args: toolArgs,
          toolOutput,
          clientAction,
        },
      ];
      const nextConversationState = deriveConversationState(
        activeConversationState,
        toolEvents,
      );

      const title = item.title;
      const byline = item.channel || item.artists ? ` by ${item.channel ?? item.artists}` : "";
      const reply = toolOutput.error
        ? String(toolOutput.error)
        : pending.source === "youtube"
          ? `Now playing "${title}"${byline}.`
          : `Playing "${title}"${byline} on Spotify.`;

      return jsonNoStore({
        mode: "live",
        reply,
        actions,
        state: nextConversationState,
      });
    }

    const pendingMediaCorrection = getPendingMediaCorrection(
      activeConversationState,
      latestUserMessage,
    );

    if (pendingMediaCorrection) {
      const toolName =
        pendingMediaCorrection.source === "youtube" ? "search_youtube" : "spotify_search";
      const toolArgs =
        pendingMediaCorrection.source === "youtube"
          ? { query: pendingMediaCorrection.query }
          : { query: pendingMediaCorrection.query, type: "track" };

      const { toolOutput, clientAction } = await executeTool(
        toolName,
        toolArgs,
        userId,
        supabase,
      );

      const actions = clientAction ? [clientAction] : [];
      const toolEvents: ToolExecutionEvent[] = [
        {
          name: toolName,
          args: toolArgs,
          toolOutput,
          clientAction,
        },
      ];
      const nextConversationState = deriveConversationState(
        { pendingMediaSelection: null },
        toolEvents,
      );

      return jsonNoStore({
        mode: "live",
        reply: formatMediaSearchReply(
          pendingMediaCorrection.source,
          pendingMediaCorrection.query,
          toolOutput,
        ),
        actions,
        state: nextConversationState,
      });
    }

    const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    if (totalChars > 12000) {
      return jsonNoStore(
        { error: "Conversation payload is too large. Start a new chat or shorten the prompt." },
        413,
      );
    }

    const client = getGeminiClient();

    if (!client) {
      return jsonNoStore({
        mode: "offline",
        reply: buildOfflineReply(latestUserMessage),
        actions: [],
        state: activeConversationState,
      });
    }

    const turnContextInstruction = buildConversationContextInstruction(
      activeConversationState,
      latestUserMessage,
    );
    const activeSystemInstruction = turnContextInstruction
      ? `${eveSystemPrompt}\n\n${turnContextInstruction}`
      : eveSystemPrompt;

    const contents: Content[] = buildContents(messages);
    const actions: ClientAction[] = [];
    const toolEvents: ToolExecutionEvent[] = [];
    let reply = "";
    let lastToolsUsed: string[] = [];

    for (let turn = 0; turn < 5; turn++) {
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: activeSystemInstruction,
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 1024,
          tools: [{ functionDeclarations: EVE_FUNCTION_DECLARATIONS }],
        },
      });

      // Capture any text the model produced — even if it also made tool calls
      const responseText = response.text?.trim() ?? "";
      if (responseText) reply = responseText;

      const fnCalls = response.functionCalls;

      if (!fnCalls || fnCalls.length === 0) {
        // No more tool calls — use whatever text we have
        break;
      }

      // Build model turn — include any text + function calls
      const modelParts: Part[] = [];
      if (responseText) modelParts.push({ text: responseText });
      for (const fc of fnCalls) {
        modelParts.push({
          functionCall: { name: fc.name, args: fc.args, id: fc.id },
        });
      }
      contents.push({ role: "model", parts: modelParts });

      // Execute tools, build functionResponse parts
      const responseParts: Part[] = [];
      lastToolsUsed = [];
      for (const fc of fnCalls) {
        lastToolsUsed.push(fc.name ?? "");
        const { toolOutput, clientAction } = await executeTool(
          fc.name ?? "",
          (fc.args as Record<string, unknown>) ?? {},
          userId,
          supabase
        );

        if (clientAction) actions.push(clientAction);
        toolEvents.push({
          name: fc.name ?? "",
          args: (fc.args as Record<string, unknown>) ?? {},
          toolOutput,
          clientAction,
        });

        responseParts.push({
          functionResponse: { name: fc.name, id: fc.id, response: toolOutput },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    // If we still have no text after the loop, force a final text-only pass
    if (!reply) {
      try {
        const fallback = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction: activeSystemInstruction +
              "\n\nIMPORTANT: You must now respond with a short spoken confirmation of what you just did. Do not call any tools.",
            temperature: 0.7,
            maxOutputTokens: 200,
          },
        });
        reply = fallback.text?.trim() ?? "";
      } catch { /* ignore */ }
    }

    // Last resort — generate a sensible default from what tools were called
    if (!reply) {
      if (actions.length > 0) {
        reply = "Done.";
      } else {
        reply = "I ran into an issue generating a response. Please try again.";
      }
    }

    const nextConversationState = deriveConversationState(
      activeConversationState,
      toolEvents,
    );

    return jsonNoStore({
      mode: "live",
      reply,
      actions,
      state: nextConversationState,
    });
  } catch (error) {
    console.error("chat-route-error", error);
    return jsonNoStore(
      {
        error:
          "Eve hit a routing problem while generating the reply. Check the server logs and Gemini key.",
      },
      500,
    );
  }
}
