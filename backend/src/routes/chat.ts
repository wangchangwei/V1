import express from "express";
import type { Request, Response } from "express";
import { piChatStream, hasPiContainer } from "../services/piProxy";
import {
  getOrCreateChatSession,
  sessionToPiMessages,
  type Message,
  type ToolCallRecord,
} from "../services/chatSessions";
import { captureSnapshot, pruneSnapshots, restoreSnapshot } from "../services/snapshots";
import { withProjectLock } from "../services/locks";

const router = express.Router();

router.post("/:containerId/messages", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;
  const { message, attachments = [], stream = false } = req.body ?? {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: "Message is required",
    });
  }

  if (!hasPiContainer(containerId)) {
    return res.status(503).json({
      success: false,
      error: `Pi container not running for project ${containerId}`,
    });
  }

  try {
    await withProjectLock(containerId, async () => {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");

        const stream = runChatTurn(containerId, message, attachments, req);

        const keepalive = setInterval(() => {
          try {
            res.write(": keepalive\n\n");
          } catch (_) {}
        }, 15000);
        (res as any).__keepalive = keepalive;

        try {
          for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        } finally {
          clearInterval(keepalive);
        }

        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        const { userMessage, assistantMessage } = await runChatTurnNonStreaming(
          containerId,
          message,
          attachments
        );

        res.json({
          success: true,
          userMessage,
          assistantMessage,
        });
      }
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Chat error] message:", err.message);
    console.error("[Chat error] stack:", err.stack);
    if (stream) {
      if ((res as any).__keepalive) clearInterval((res as any).__keepalive);
      if (!res.writableEnded) {
        try {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              data: {
                error: err.message,
              },
            })}\n\n`
          );
          res.end();
        } catch (_) {
          // client disconnected; nothing more to write
        }
      }
    } else {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: err.message,
        });
      }
    }
  }
});

router.get("/:containerId/messages", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;

  try {
    const session = getOrCreateChatSession(containerId);

    res.json({
      success: true,
      messages: session.messages,
      sessionId: session.id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// PATCH /chat/:containerId/messages/:messageId
// Edit a past user message and regenerate from that point forward.
// Acquires withProjectLock to serialize against in-flight POST /messages.
//
// Atomicity invariant: restoreSnapshot MUST complete before
// session.messages is truncated. If restore throws, the session is
// left untouched and the response is 500 (or 410 if tarball missing).
router.patch("/:containerId/messages/:messageId", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;
  const messageId = req.params.messageId as string;
  const { content } = req.body ?? {};

  if (typeof content !== "string" || content.length === 0) {
    return res.status(400).json({ success: false, error: "content must be a non-empty string" });
  }

  const session = getOrCreateChatSession(containerId);
  const editIndex = session.messages.findIndex((m) => m.id === messageId);
  if (editIndex < 0) {
    return res.status(404).json({ success: false, error: "message_not_found" });
  }
  const target = session.messages[editIndex]!;
  if (target.role !== "user") {
    return res.status(400).json({ success: false, error: "can only edit user-role messages" });
  }
  if (!target.snapshotId) {
    return res.status(410).json({ success: false, error: "snapshot_gone" });
  }

  if (!hasPiContainer(containerId)) {
    return res.status(503).json({
      success: false,
      error: `Pi container not running for project ${containerId}`,
    });
  }

  try {
    await withProjectLock(containerId, async () => {
      // 1. Restore filesystem (may throw if tarball missing — caught below)
      try {
        await restoreSnapshot(containerId, target.snapshotId!);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "unknown";
        const code = (err as any)?.code;
        const isMissing = code === "ENOENT" || /ENOENT|no such file/i.test(errMsg);
        if (isMissing) {
          res.status(410).json({ success: false, error: "snapshot_gone" });
        } else {
          console.error("[Chat PATCH] restore failed for", containerId, "snapshotId:", target.snapshotId, "error:", errMsg);
          res.status(500).json({ success: false, error: "restore_failed" });
        }
        return;  // abort: do NOT truncate session
      }

      // 2. Truncate session.messages to [0..editIndex], then update content.
      session.messages = session.messages.slice(0, editIndex + 1);
      session.messages[editIndex]!.content = content;
      session.updatedAt = new Date().toISOString();

      // 3. Stream the regenerated AI response.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const stream = runChatTurn(containerId, content, [], req);
      const keepalive = setInterval(() => {
        try { res.write(": keepalive\n\n"); } catch (_) {}
      }, 15000);
      (res as any).__keepalive = keepalive;

      try {
        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } finally {
        clearInterval(keepalive);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Chat PATCH error] message:", err.message);
    console.error("[Chat PATCH error] stack:", err.stack);
    if ((res as any).__keepalive) clearInterval((res as any).__keepalive);
    if (res.headersSent) {
      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({ type: "error", data: { error: err.message } })}\n\n`);
          res.end();
        } catch (_) { /* client gone */ }
      }
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run a chat turn: append user message, capture snapshot, stream from pi.
// Emits V1-format SSE chunks that the frontend already understands.
// `req` is passed to forward client-disconnect as an AbortSignal.
async function* runChatTurn(
  containerId: string,
  userMessage: string,
  attachments: any[],
  req: any
): AsyncGenerator<{ type: string; data: any }> {
  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);
  // Don't yield here — pi-http-entry echoes the user message back via its
  // own `message_start` event, which we forward. Yielding here too would
  // produce duplicate user messages on the chat page.

  // Capture filesystem snapshot BEFORE the AI starts mutating files.
  // Best-effort: only set snapshotId on success so the message is
  // not marked as regenerable when no snapshot exists.
  const captureOk = await captureSnapshot(containerId, userMsg.id);
  if (captureOk) {
    userMsg.snapshotId = userMsg.id;
  }
  await pruneSnapshots(containerId, 20);

  const allToolCalls: ToolCallRecord[] = [];
  let finalContent = "";
  let seenDone = false;

  try {
    for await (const chunk of piChatStream(
      containerId,
      sessionToPiMessages(session),
      req?.signal
    )) {
      if (chunk.type === "user") {
        // Normalize user content to string: pi may emit [{type:"text",text:"..."}]
        const content = chunk.data?.content;
        if (Array.isArray(content)) {
          const text = content.map((c: any) => c.text ?? "").join("");
          yield { ...chunk, data: { ...chunk.data, content: text } };
        } else {
          yield chunk;
        }
      } else if (chunk.type === "assistant") {
        // pi emits delta-style assistant chunks; concatenate text deltas.
        const text = extractAssistantText(chunk.data);
        if (text) finalContent += text;
        // Normalize content to string and yield to frontend.
        yield { ...chunk, data: { ...chunk.data, content: text } };
      } else if (chunk.type === "tool_call") {
        // Tool calls happen between text deltas; forward them so the chat page
        // can render the agent's actions in real time (e.g., file reads, bash).
        const record: ToolCallRecord = {
          id: chunk.data.id,
          name: chunk.data.name,
          args: chunk.data.args ?? "",
          ok: true,
          result: "",
        };
        allToolCalls.push(record);
        yield chunk;
      } else if (chunk.type === "tool_result") {
        const last = allToolCalls.find((tc) => tc.id === chunk.data.id);
        if (last) {
          last.ok = !!chunk.data.ok;
          last.result = chunk.data.result ?? "";
        }
        yield chunk;
      } else if (chunk.type === "error") {
        yield { type: "error", data: chunk.data };
        return;
      } else {
        yield chunk;
      }
      if (chunk.type === "done") {
        seenDone = true;
        break;
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[chat] pi stream failed:", err.message);
    yield { type: "error", data: { error: err.message } };
    return;
  }

  const assistantMsg: Message = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: finalContent || "Sorry, I could not generate a response.",
    timestamp: new Date().toISOString(),
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  };
  session.messages.push(assistantMsg);
  session.updatedAt = new Date().toISOString();

  if (!seenDone) {
    yield { type: "assistant", data: assistantMsg };
    yield { type: "done", data: assistantMsg };
  }
}

// Non-streaming variant for clients without SSE support.
// Collects the full assistant message then returns it as JSON.
async function runChatTurnNonStreaming(
  containerId: string,
  userMessage: string,
  attachments: any[]
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  let userMsg: Message | undefined;
  let assistantMsg: Message | undefined;

  for await (const chunk of runChatTurn(containerId, userMessage, attachments, undefined)) {
    if (chunk.type === "user") userMsg = chunk.data;
    // 'done' has empty data {} — capture the last 'assistant' chunk instead.
    if (chunk.type === "assistant") assistantMsg = chunk.data;
    if (chunk.type === "done") {
      // assistantMsg was already set by the last 'assistant' chunk above.
    }
    if (chunk.type === "error") {
      throw new Error(chunk.data?.error ?? "pi stream error");
    }
  }

  if (!userMsg) throw new Error("stream produced no user message");
  if (!assistantMsg) {
    assistantMsg = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "Sorry, I could not generate a response.",
      timestamp: new Date().toISOString(),
    };
  }
  return { userMessage: userMsg, assistantMessage: assistantMsg };
}

// pi-http-entry sends delta-style {content} chunks during streaming and
// a full {content, message} chunk at message_end. Extract the visible text.
function extractAssistantText(data: any): string {
  if (!data) return "";
  if (typeof data.content === "string") return data.content;
  if (Array.isArray(data.content)) {
    return data.content
      .filter((c: any) => c?.type === "text")
      .map((c: any) => c.text ?? "")
      .join("");
  }
  return "";
}

export default router;
