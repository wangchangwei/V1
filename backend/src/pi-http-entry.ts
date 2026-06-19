/**
 * pi sidecar HTTP entrypoint.
 *
 * Runs INSIDE the pi container. The V1 backend on the host calls this service
 * via HTTP at http://<container-ip>:7890. The container exposes the project
 * workspace at /workspace.
 *
 * Translates pi AgentSession events into the SSE chunk format that the V1
 * frontend already understands (see backend/src/services/llm.ts:283-381):
 *
 *   data: {"type":"user","data":{...}}\n\n
 *   data: {"type":"assistant","data":{...}}\n\n
 *   data: {"type":"tool_call","data":{...}}\n\n
 *   data: {"type":"tool_result","data":{...}}\n\n
 *   data: {"type":"done","data":{...}}\n\n
 *   data: {"type":"error","data":{...}}\n\n
 */
import express from "express";
import type { Request, Response } from "express";
import {
  createAgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

type V1ChunkType =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "done"
  | "error";

interface V1Chunk {
  type: V1ChunkType;
  data: any;
}

interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
}

interface ChatRequest {
  messages: IncomingMessage[];
  stream?: boolean;
  model?: string;
  temperature?: number;
}

const app = express();
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/v1/models", (_req: Request, res: Response) => {
  // The pi sidecar inherits model selection from the pi auth/settings
  // configured inside the container (auth.json + models.json under ~/.pi/agent).
  // The V1 backend already knows its supported models; this endpoint exists
  // for parity with OpenAI's /v1/models shape and can be extended later.
  res.json({ data: [] });
});

function extractUserText(msg: IncomingMessage): string {
  if (typeof msg.content === "string") return msg.content;
  const textPart = msg.content.find((c) => c.type === "text");
  return textPart?.text ?? "";
}

// Module-level state for the current /v1/chat/completions session.
// The frontend expects every assistant chunk in a single turn to share the
// same id and timestamp so it can replace the streaming message in place.
let assistantId: string | null = null;
let assistantTimestamp: string | null = null;
let accumulatedText = "";

function resetSession(): void {
  assistantId = null;
  assistantTimestamp = null;
  accumulatedText = "";
}

function ensureAssistantSession(): void {
  if (!assistantId) {
    assistantId = `assistant-${Date.now()}`;
    assistantTimestamp = new Date().toISOString();
    accumulatedText = "";
  }
}

function appendDelta(delta: string): void {
  accumulatedText += delta;
}

function translateEvent(event: AgentSessionEvent): V1Chunk | null {
  switch (event.type) {
    case "message_start": {
      const m = event.message as { role?: string; content?: unknown };
      if (m.role === "user") {
        return {
          type: "user",
          data: {
            id: `user-${Date.now()}`,
            role: "user",
            content: m.content,
            timestamp: new Date().toISOString(),
          },
        };
      }
      if (m.role === "assistant") {
        ensureAssistantSession();
        return null;
      }
      return null;
    }

    case "message_update": {
      const ame = event.assistantMessageEvent;
      if (ame.type === "text_delta") {
        // Send only the new delta, NOT accumulatedText. The downstream
        // consumer (V1 backend's runChatTurn) appends to finalContent,
        // and the frontend appends to its rendered buffer. Emitting the
        // accumulated text here would cause every chunk to repeat all
        // prior chunks, doubling the visible output.
        appendDelta(ame.delta);
        return {
          type: "assistant",
          data: {
            id: assistantId!,
            role: "assistant",
            content: ame.delta,
            timestamp: assistantTimestamp!,
          },
        };
      }
      // thinking_delta, tool_call_delta, etc. are not emitted to the frontend;
      // tool calls flow through tool_execution_start / tool_execution_end.
      return null;
    }

    case "message_end": {
      const m = event.message as { role?: string; content?: unknown };
      if (m.role !== "assistant") return null;
      // AssistantMessage.content is an array of TextContent | ThinkingContent | ToolCall.
      // Concatenate text blocks for the final answer payload, falling back to
      // whatever we accumulated from text_delta events.
      let text = accumulatedText;
      if (typeof m.content === "string") {
        text = m.content;
      } else if (Array.isArray(m.content)) {
        text = m.content
          .filter((c: any) => c?.type === "text")
          .map((c: any) => c.text ?? "")
          .join("");
      }
      return {
        type: "assistant",
        data: {
          id: assistantId!,
          role: "assistant",
          content: text,
          message: m,
          timestamp: assistantTimestamp!,
        },
      };
    }

    case "tool_execution_start":
      return {
        type: "tool_call",
        data: {
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
        },
      };

    case "tool_execution_end":
      return {
        type: "tool_result",
        data: {
          id: event.toolCallId,
          name: event.toolName,
          ok: !event.isError,
          result: event.result,
        },
      };

    case "agent_end":
      return { type: "done", data: {} };

    default:
      return null;
  }
}

app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  // Auth: V1 backend sets a shared PI_SECRET when starting this container
  // (see piContainerManager). We require the same value in x-pi-secret.
  // /health is intentionally unauthenticated so docker HEALTHCHECK works.
  const expected = process.env.PI_SECRET;
  if (expected) {
    const provided = req.header("x-pi-secret");
    if (!provided || provided !== expected) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const { messages, stream = true, model } = (req.body ?? {}) as ChatRequest;

  if (stream === false) {
    return res.status(400).json({ error: "Only streaming supported" });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  const userMessages = messages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  if (!lastUser) {
    return res.status(400).json({ error: "messages must contain a user message" });
  }
  const promptText = extractUserText(lastUser);
  if (!promptText) {
    return res.status(400).json({ error: "last user message has no text content" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const write = (chunk: V1Chunk): void => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  const writeError = (msg: string): void => {
    write({ type: "error", data: { error: msg } });
  };

  try {
    resetSession();
    const { session } = await createAgentSession({ cwd: "/workspace" });

    // Apply the requested model before this turn. The format is either
    // "provider:modelId" (explicit) or just "modelId" (default provider =
    // "minimax", which is the actual provider for MiniMax models).
    // Empty / unset means "use the container's default from settings.json".
    if (model && typeof model === "string") {
      const [provider, modelId] = model.includes(":")
        ? (model.split(":", 2) as [string, string])
        : (["minimax", model] as [string, string]);
      const target = session.modelRegistry.find(provider, modelId);
      if (!target) {
        return res.status(400).json({ error: "model_not_in_registry" });
      }
      // Avoid the round-trip + settings write when nothing would change.
      if (session.model?.id !== target.id) {
        await session.setModel(target);
      }
    }

    let closed = false;
    const unsubscribe = session.subscribe((event) => {
      if (closed) return;
      try {
        const chunk = translateEvent(event);
        if (chunk) write(chunk);
        if (event.type === "agent_end") {
          closed = true;
          unsubscribe();
          res.end();
        }
      } catch (err) {
        closed = true;
        unsubscribe();
        writeError(err instanceof Error ? err.message : String(err));
        res.end();
      }
    });

    req.on("close", () => {
      closed = true;
      unsubscribe();
    });

    await session.prompt(promptText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.writableEnded) {
      writeError(msg);
      res.end();
    }
  }
});

const PORT = Number(process.env.PI_PORT || 7890);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[pi-http-entry] listening on :${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);