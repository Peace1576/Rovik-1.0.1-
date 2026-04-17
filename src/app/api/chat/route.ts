import { GoogleGenAI, Content, Part } from "@google/genai";
import { NextRequest } from "next/server";

import { jsonNoStore, rejectCrossSiteRequest } from "@/lib/api-security";
import {
  buildConversationContextInstruction,
  deriveConversationState,
  normalizeConversationState,
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
    const conversationState = normalizeConversationState(body.state);
    const latestUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    if (!latestUserMessage) {
      return jsonNoStore(
        { error: "Send a prompt for Eve to respond to." },
        400,
      );
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
        state: conversationState,
      });
    }

    const turnContextInstruction = buildConversationContextInstruction(
      conversationState,
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
      conversationState,
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
