import express from "express";
import { enrichPrompt } from "../services/promptEnricher";

const router = express.Router();

router.post("/enrich", async (req, res) => {
  const { prompt, template, model } = req.body ?? {};

  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({
      success: false,
      error: "prompt is required and must be a non-empty string",
    });
  }
  if (typeof template !== "string" || !template.trim()) {
    return res.status(400).json({
      success: false,
      error: "template is required and must be a non-empty string",
    });
  }
  if (model !== undefined && typeof model !== "string") {
    return res.status(400).json({
      success: false,
      error: "model must be a string if provided",
    });
  }

  // Cap input length defensively so a runaway LLM response stays bounded.
  if (prompt.length > 2000) {
    return res.status(400).json({
      success: false,
      error: "prompt is too long (max 2000 characters)",
    });
  }

  try {
    const enriched = await enrichPrompt({
      prompt: prompt.trim(),
      template: template.trim(),
      model,
    });
    return res.json({ success: true, enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[prompts/enrich] failed:", message);
    return res.status(502).json({
      success: false,
      error: `AI enrichment failed: ${message}`,
    });
  }
});

export default router;
