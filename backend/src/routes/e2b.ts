// E2B sandbox management routes.

import express from "express";
import {
  startE2BSandbox,
  stopE2BSandbox,
  restartE2BSandbox,
  getE2BSandbox,
  hasE2BSandbox,
  writeFileToSandbox,
} from "../services/e2bSandboxManager";
import { readFile, listFiles, getFileTree } from "../services/file";

const router = express.Router();

// POST /e2b/:projectId/sandbox — start or restart sandbox
router.post("/:projectId/sandbox", async (req, res) => {
  const { projectId } = req.params;
  const { forceRestart } = req.body ?? {};

  try {
    if (forceRestart) {
      const handle = await restartE2BSandbox(projectId);
      return res.json({
        success: true,
        sandboxId: handle.sandboxId,
        previewUrl: handle.previewUrl,
        status: "running",
      });
    }

    if (hasE2BSandbox(projectId)) {
      const handle = getE2BSandbox(projectId)!;
      return res.json({
        success: true,
        sandboxId: handle.sandboxId,
        previewUrl: handle.previewUrl,
        status: handle.sandbox.isRunning() ? "running" : "stopped",
      });
    }

    const handle = await startE2BSandbox(projectId);
    res.json({
      success: true,
      sandboxId: handle.sandboxId,
      previewUrl: handle.previewUrl,
      status: "running",
    });
  } catch (error) {
    console.error("[e2b] Failed to start sandbox:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start sandbox",
    });
  }
});

// DELETE /e2b/:projectId/sandbox — stop sandbox
router.delete("/:projectId/sandbox", async (req, res) => {
  const { projectId } = req.params;
  try {
    await stopE2BSandbox(projectId);
    res.json({ success: true, status: "stopped" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop sandbox",
    });
  }
});

// GET /e2b/:projectId/preview-url — get current preview URL
router.get("/:projectId/preview-url", async (req, res) => {
  const { projectId } = req.params;
  const handle = getE2BSandbox(projectId);

  if (!handle) {
    return res.status(404).json({ success: false, error: "Sandbox not running" });
  }

  res.json({
    success: true,
    previewUrl: handle.previewUrl,
    sandboxId: handle.sandboxId,
    status: handle.sandbox.isRunning() ? "running" : "stopped",
  });
});

// GET /e2b/:projectId/files — list project files
router.get("/:projectId/files", async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath } = req.query;

  try {
    if (filePath) {
      const content = await readFile(projectId, filePath as string);
      return res.json({ success: true, path: filePath, content });
    }
    const tree = await getFileTree(projectId);
    res.json({ success: true, files: tree });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to read files",
    });
  }
});

// PUT /e2b/:projectId/file — write a file (host + sandbox sync)
router.put("/:projectId/file", async (req, res) => {
  const { projectId } = req.params;
  const { path: filePath, content } = req.body ?? {};

  if (!filePath || content === undefined) {
    return res.status(400).json({ success: false, error: "path and content required" });
  }

  try {
    await writeFileToSandbox(projectId, filePath as string, content as string);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to write file",
    });
  }
});

export default router;
