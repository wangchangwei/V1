import express from "express";

const router = express.Router();

// Prompt enrichment previously delegated to a standalone LLM service
// (services/promptEnricher.ts) which has been removed. The pi sidecar
// now owns prompt handling end-to-end, so this route is intentionally
// disabled. Kept as a stub so callers receive a clear error code instead
// of a 404 from the router.
router.post("/enrich", async (_req, res) => {
  return res.status(501).json({
    success: false,
    error: "prompt enrichment is no longer supported (removed in pi migration)",
  });
});

export default router;