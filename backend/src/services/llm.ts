import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat";
import { config } from "../../config";
import prompt from "../utils/prompt.txt";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import { captureSnapshot, pruneSnapshots } from "./snapshots";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  snapshotId?: string;  // set after captureSnapshot returns true
}

export interface Attachment {
  type: "image" | "document";
  data: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: string;
  result: string;
  ok: boolean;
}

export interface ChatSession {
  id: string;
  containerId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const chatSessions = new Map<string, ChatSession>();

// AI_BASE_URL may or may not include a version segment (e.g. "/v1").
// The OpenAI SDK appends "/chat/completions" to baseURL, so the base must
// end with the path the provider actually serves. Ensure "/v1" is present.
const sdkBaseURL = (() => {
  const u = config.aiSdk.baseUrl.replace(/\/+$/, "");
  return /\/(v\d+)$/.test(u) ? u : `${u}/v1`;
})();

const client = new OpenAI({
  baseURL: sdkBaseURL,
  apiKey: config.aiSdk.apiKey,
});

const MAX_TOOL_ITERATIONS = 8;

export async function createChatSession(
  containerId: string
): Promise<ChatSession> {
  const sessionId = `${containerId}-${Date.now()}`;
  const session: ChatSession = {
    id: sessionId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatSessions.set(sessionId, session);
  return session;
}

export function getChatSession(sessionId: string): ChatSession | undefined {
  return chatSessions.get(sessionId);
}

export function getOrCreateChatSession(containerId: string): ChatSession {
  const existingSession = Array.from(chatSessions.values()).find(
    (session) => session.containerId === containerId
  );

  if (existingSession) {
    return existingSession;
  }

  const sessionId = `${containerId}-${Date.now()}`;
  const session: ChatSession = {
    id: sessionId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatSessions.set(sessionId, session);
  return session;
}

function buildUserContent(
  message: string,
  attachments: Attachment[] = []
): ChatCompletionMessageParam {
  if (!attachments || attachments.length === 0) {
    return { role: "user", content: message };
  }

  const parts: Array<Record<string, any>> = [
    { type: "text", text: message },
  ];
  for (const attachment of attachments) {
    if (attachment.type === "image") {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${attachment.data}`,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      parts.push({
        type: "text",
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }
  return { role: "user", content: parts as any };
}

function sessionToOpenAIMessages(
  session: ChatSession
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [
    { role: "system", content: prompt },
  ];
  for (const msg of session.messages) {
    if (msg.role === "user") {
      result.push(
        buildUserContent(msg.content, msg.attachments) as ChatCompletionMessageParam
      );
    } else if (msg.role === "assistant") {
      const toolCalls = (msg.toolCalls ?? []).map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args },
      }));
      result.push({
        role: "assistant",
        content: msg.content || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      for (const tc of msg.toolCalls ?? []) {
        result.push({
          role: "tool",
          tool_call_id: tc.id,
          content: tc.ok ? tc.result : `Error: ${tc.result}`,
        });
      }
    }
  }
  return result;
}

async function runAssistantTurn(
  messages: ChatCompletionMessageParam[],
  model: string
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; args: string }> }> {
  const response = await client.chat.completions.create({
    model,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: "auto",
    temperature: config.aiSdk.temperature,
  });

  const choice = response.choices[0];
  if (!choice) {
    return { content: "", toolCalls: [] };
  }
  const message = choice.message;
  const content = message.content ?? "";
  const toolCalls = (message.tool_calls ?? [])
    .filter((tc): tc is Extract<typeof tc, { function: any }> => tc.type === "function")
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: tc.function.arguments,
    }));

  return { content, toolCalls };
}

async function runToolUseLoop(
  session: ChatSession,
  model: string
): Promise<{ content: string; toolCalls: ToolCallRecord[] }> {
  const messages = sessionToOpenAIMessages(session);
  let allToolCalls: ToolCallRecord[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const turn = await runAssistantTurn(messages, model);
    if (turn.toolCalls.length === 0) {
      return { content: turn.content, toolCalls: allToolCalls };
    }

    messages.push({
      role: "assistant",
      content: turn.content || null,
      tool_calls: turn.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args },
      })),
    });

    for (const tc of turn.toolCalls) {
      const result = await executeTool(tc.name, tc.args, session.containerId);
      allToolCalls.push({
        id: tc.id,
        name: tc.name,
        args: tc.args,
        ok: result.ok,
        result: result.output,
      });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.ok ? result.output : `Error: ${result.output}`,
      });
    }
  }

  return {
    content: "Sorry, I had to stop after several file operations. Could you rephrase or simplify the request?",
    toolCalls: allToolCalls,
  };
}

export async function sendMessage(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = [],
  model?: string
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const session = getOrCreateChatSession(containerId);
  const resolvedModel = model ?? config.aiSdk.model;

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);

  const { content, toolCalls } = await runToolUseLoop(session, resolvedModel);

  const assistantMsg: Message = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: content || "Sorry, I could not generate a response.",
    timestamp: new Date().toISOString(),
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
  session.messages.push(assistantMsg);
  session.updatedAt = new Date().toISOString();

  return { userMessage: userMsg, assistantMessage: assistantMsg };
}

export async function* sendMessageStream(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = [],
  model?: string
): AsyncGenerator<{
  type: "user" | "assistant" | "tool_call" | "tool_result" | "done" | "error";
  data: any;
}> {
  const session = getOrCreateChatSession(containerId);
  const resolvedModel = model ?? config.aiSdk.model;

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);
  yield { type: "user", data: userMsg };

  // Capture filesystem snapshot BEFORE the AI starts mutating files.
  // Best-effort: only set snapshotId on success so the message is
  // not marked as regenerable when no snapshot exists.
  const captureOk = await captureSnapshot(containerId, userMsg.id);
  if (captureOk) {
    userMsg.snapshotId = userMsg.id;
  }
  await pruneSnapshots(containerId, 20);

  const messages = sessionToOpenAIMessages(session);
  const allToolCalls: ToolCallRecord[] = [];
  let finalContent = "";

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const turn = await runAssistantTurn(messages, resolvedModel);
      if (turn.toolCalls.length === 0) {
        finalContent = turn.content;
        break;
      }

      messages.push({
        role: "assistant",
        content: turn.content || null,
        tool_calls: turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        })),
      });

      for (const tc of turn.toolCalls) {
        yield {
          type: "tool_call",
          data: { id: tc.id, name: tc.name, args: tc.args },
        };
        const result = await executeTool(
          tc.name,
          tc.args,
          session.containerId
        );
        const record: ToolCallRecord = {
          id: tc.id,
          name: tc.name,
          args: tc.args,
          ok: result.ok,
          result: result.output,
        };
        allToolCalls.push(record);
        yield { type: "tool_result", data: record };
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result.ok ? result.output : `Error: ${result.output}`,
        });
      }
    }

    if (!finalContent) {
      finalContent =
        "Sorry, I had to stop after several file operations. Could you rephrase or simplify the request?";
    }

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: finalContent,
      timestamp: new Date().toISOString(),
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date().toISOString();

    yield { type: "assistant", data: assistantMsg };
    yield { type: "done", data: assistantMsg };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[llm] tool loop failed:", err.message);
    yield { type: "error", data: { error: err.message } };
  }
}
