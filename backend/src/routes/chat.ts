import express from "express";
import * as llmService from "../services/llm";
import { isSupportedModel } from "../services/models";
import { withProjectLock } from "../services/locks";

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

export default router;
