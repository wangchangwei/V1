import { Router } from "express";
import { deployToVercel } from "../services/deploy";
import { getProjectByIdOrUuid, setProjectVercelUrl } from "../services/project";

const router = Router();

router.post("/:containerId", async (req, res) => {
  const { containerId } = req.params;
  const { vercelToken } = req.body;

  if (!vercelToken || typeof vercelToken !== "string" || !vercelToken.trim()) {
    res.status(400).json({ success: false, error: "vercelToken is required" });
    return;
  }

  try {
    // Verify project exists
    await getProjectByIdOrUuid(containerId);

    const result = await deployToVercel(containerId, vercelToken.trim());
    if (result.url) {
      await setProjectVercelUrl(containerId, result.url);
    }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[deploy] Failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Deploy failed",
    });
  }
});

export default router;
