import express from "express";
import * as llmService from "../services/llm";
import { isSupportedModel } from "../services/models";
import { withProjectLock } from "../services/locks";
import { restoreSnapshot } from "../services/snapshots";

const router = express.Router();

//@ts-ignore
router.post("/:containerId/messages", async (req, res) => {
  const { containerId } = req.params;
  const { message, attachments = [], stream = false, model } = req.body;

  if (model !== undefined && !isSupportedModel(model)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported model: ${model}`,
    });
  }

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: "Message is required",
    });
  }

  try {
    await withProjectLock(containerId, async () => {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");

        const messageStream = llmService.sendMessageStream(
          containerId,
          message,
          attachments,
          model
        );

        const keepalive = setInterval(() => {
          try {
            res.write(": keepalive\n\n");
          } catch (_) {}
        }, 15000);
        (res as any).__keepalive = keepalive;

        try {
          for await (const chunk of messageStream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        } finally {
          clearInterval(keepalive);
        }

        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        const { userMessage, assistantMessage } = await llmService.sendMessage(
          containerId,
          message,
          attachments,
          model
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

router.get("/:containerId/messages", async (req, res) => {
  const { containerId } = req.params;

  try {
    const session = llmService.getOrCreateChatSession(containerId);

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
router.patch("/:containerId/messages/:messageId", async (req, res) => {
  const { containerId, messageId } = req.params;
  const { content } = req.body ?? {};

  if (typeof content !== "string" || content.length === 0) {
    return res.status(400).json({ success: false, error: "content must be a non-empty string" });
  }

  const session = llmService.getOrCreateChatSession(containerId);
  const editIndex = session.messages.findIndex((m) => m.id === messageId);
  if (editIndex < 0) {
    return res.status(404).json({ success: false, error: "message_not_found" });
  }
  const target = session.messages[editIndex];
  if (target.role !== "user") {
    return res.status(400).json({ success: false, error: "can only edit user-role messages" });
  }
  if (!target.snapshotId) {
    return res.status(410).json({ success: false, error: "snapshot_gone" });
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
          res.status(500).json({ success: false, error: "restore_failed", detail: errMsg });
        }
        return;  // abort: do NOT truncate session
      }

      // 2. Truncate session.messages to [0..editIndex], then update content.
      session.messages = session.messages.slice(0, editIndex + 1);
      session.messages[editIndex].content = content;
      session.updatedAt = new Date().toISOString();

      // 3. Stream the regenerated AI response.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const stream = llmService.sendMessageStream(containerId, content, [], undefined);
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
    if (res.headersSent) return;  // already streaming; abort silently
    const err = error instanceof Error ? error : new Error(String(error));
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
