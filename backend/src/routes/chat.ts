import express from "express";
import * as llmService from "../services/llm";

const router = express.Router();

//@ts-ignore
router.post("/:containerId/messages", async (req, res) => {
  const { containerId } = req.params;
  const { message, attachments = [], stream = false } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: "Message is required",
    });
  }

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const messageStream = llmService.sendMessageStream(
        containerId,
        message,
        attachments
      );

      for await (const chunk of messageStream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const { userMessage, assistantMessage } = await llmService.sendMessage(
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
  } catch (error) {
    console.log(error);
    if (stream) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
