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
import {
  getProjectModel,
  setProjectModel,
} from "../services/project";
import { TurnBroadcaster } from "../services/turnBroadcaster";
import {
  getBroadcaster,
  removeBroadcaster,
  setBroadcaster,
} from "../services/turnBroadcasters";
import { DEFAULT_MODEL, MODELS, type ModelId } from "../config";

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
      const turnModel = await getProjectModel(containerId);

      // Reject streaming: this endpoint is now JSON-only.
      if (stream) {
        return res.status(400).json({
          success: false,
          error: "stream mode is no longer supported; use GET /chat/:id/turn-stream to subscribe",
        });
      }

      // 409 if a turn is already in flight for this project.
      if (getBroadcaster(containerId)) {
        return res.status(409).json({
          success: false,
          error: "turn_in_progress",
        });
      }

      const { userMsg, assistantId } = await runChatTurn(
        containerId,
        message,
        attachments,
        req,
        turnModel
      );

      res.json({
        success: true,
        userMessage: userMsg,
        assistantMessageId: assistantId,
      });
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Chat error] message:", err.message);
    console.error("[Chat error] stack:", err.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
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

// GET /chat/:containerId/turn-status — report whether a turn is in-flight and,
// if so, the partial response captured so far. Used by the frontend on page
// reload to resume rendering the streaming answer instead of dropping it.
//
// Sourcing from the broadcaster registry: TurnBroadcaster owns the same
// partialText/toolCalls/state the old `inProgressTurn` field used to carry.
// PATCH /chat/:containerId/messages/:messageId
// Edit a past user message and regenerate from that point forward.
// Acquires withProjectLock to serialize against in-flight POST /messages.
//
// Atomicity invariant: restoreSnapshot MUST complete before
// session.messages is truncated. If restore throws, the session is
// left untouched and the response is 500 (or 410 if tarball missing).
router.get("/:containerId/turn-status", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;

  try {
    const b = getBroadcaster(containerId);
    if (!b) {
      res.json({ processing: false });
      return;
    }
    const state = b.getState();
    res.json({
      processing: state.status === "running",
      inProgressTurn: {
        userMsgId: state.userMsg.id,
        assistantMsgId: state.assistantMsgId,
        partialText: state.partialText,
        toolCalls: state.toolCalls,
        startedAt: state.startedAt,
      },
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

      // 3. Drive the regenerated AI response via the broadcaster. PATCH is
      //    the same fire-and-forget shape as POST: clients subscribe to
      //    GET /turn-stream for live updates.
      const turnModel = await getProjectModel(containerId);
      if (getBroadcaster(containerId)) {
        res.status(409).json({ success: false, error: "turn_in_progress" });
        return;
      }
      const { userMsg, assistantId } = await runChatTurn(
        containerId,
        content,
        [],
        req?.signal,
        turnModel
      );

      res.json({
        success: true,
        userMessage: userMsg,
        assistantMessageId: assistantId,
      });
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Chat PATCH error] message:", err.message);
    console.error("[Chat PATCH error] stack:", err.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Run a chat turn: append user message, capture snapshot, stream from pi
// into a TurnBroadcaster. Returns the created broadcaster; caller registers
// it and lets the turn run in the background (fire-and-forget).
//
// `onAssistant` is called once with the final assistant Message so the
// caller can append it to session.messages (after piChatStream completes).
async function runChatTurn(
  containerId: string,
  userMessage: string,
  attachments: any[],
  turnModel?: string,
  signal?: AbortSignal
): Promise<{
  broadcaster: TurnBroadcaster;
  userMsg: Message;
  assistantId: string;
  onAssistant: (cb: (msg: Message) => void) => void;
}> {
  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);

  const captureOk = await captureSnapshot(containerId, userMsg.id);
  if (captureOk) userMsg.snapshotId = userMsg.id;
  await pruneSnapshots(containerId, 20);

  const assistantId = `assistant-${Date.now()}`;
  const allToolCalls: ToolCallRecord[] = [];
  let finalContent = "";
  let seenDone = false;
  let assistantCallback: ((msg: Message) => void) | null = null;
  const onAssistant = (cb: (msg: Message) => void) => {
    assistantCallback = cb;
  };

  const broadcaster = new TurnBroadcaster(
    containerId,
    userMsg,
    assistantId,
    () => removeBroadcaster(containerId)
  );
  setBroadcaster(containerId, broadcaster);

  // Fire-and-forget background task. Runs piChatStream, emits chunks to the
  // broadcaster, and finalizes when done/error. Errors are caught so a
  // crash in the background doesn't crash the process.
  (async () => {
    try {
      for await (const chunk of piChatStream(
        containerId,
        sessionToPiMessages(session),
        signal,
        turnModel
      )) {
        if (chunk.type === "user") {
          // user message is already in session.messages; skip emit (the
          // broadcaster's user-chunk emission happens at attach-time).
          continue;
        }
        if (chunk.type === "assistant") {
          if (chunk.data.message !== undefined) {
            // Final chunk: capture finalContent but don't emit (already in partialText).
            finalContent = extractAssistantText(chunk.data);
            continue;
          }
          // Pi sends only deltas in text_delta events; accumulate into
          // finalContent before broadcasting so subscribers see full text.
          const text = extractAssistantText(chunk.data);
          if (text) finalContent += text;  // ACCUMULATION (not assignment)
          broadcaster.emit({
            ...chunk,
            data: { ...chunk.data, id: assistantId, role: "assistant", content: finalContent },
          });
        } else if (chunk.type === "tool_call") {
          allToolCalls.push({
            id: chunk.data.id,
            name: chunk.data.name,
            args: chunk.data.args ?? "",
            ok: true,
            result: "",
          });
          broadcaster.emit(chunk);
        } else if (chunk.type === "tool_result") {
          const last = allToolCalls.find((tc) => tc.id === chunk.data.id);
          if (last) {
            last.ok = !!chunk.data.ok;
            last.result =
              typeof chunk.data.result === "string"
                ? chunk.data.result
                : JSON.stringify(chunk.data.result);
          }
          broadcaster.emit(chunk);
        } else if (chunk.type === "error") {
          broadcaster.finalize("error", chunk.data);
          return;
        } else {
          broadcaster.emit(chunk);
        }
        if (chunk.type === "done") {
          seenDone = true;
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[chat] pi stream failed:", msg);
      broadcaster.finalize("error", { message: msg });
      return;
    }

    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: finalContent || "Sorry, I could not generate a response.",
      timestamp: new Date().toISOString(),
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date().toISOString();
    if (assistantCallback) assistantCallback(assistantMsg);

    if (!seenDone) {
      broadcaster.emit({ type: "assistant", data: assistantMsg });
    }
    broadcaster.finalize("done");
  })();

  return { broadcaster, userMsg, assistantId, onAssistant };
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

// GET /chat/:containerId/model — return current per-project model and the
// full list of available models for the UI dropdown.
router.get("/:containerId/model", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;
  try {
    const current = await getProjectModel(containerId);
    res.json({ success: true, current, available: MODELS });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /chat/:containerId/model — set the per-project model override. The
// next chat turn (POST /messages) will apply it via pi-http-entry. Does not
// require withProjectLock: this is a metadata write, not a turn.
router.post("/:containerId/model", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;
  const { model } = req.body ?? {};

  if (typeof model !== "string" || !MODELS.some((m) => m.id === model)) {
    return res.status(400).json({ success: false, error: "unknown_model" });
  }

  try {
    await setProjectModel(containerId, model as ModelId);
    res.json({ success: true, model });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (/not found/i.test(msg)) {
      res.status(404).json({ success: false, error: msg });
    } else {
      res.status(500).json({ success: false, error: msg });
    }
  }
});

export default router;
