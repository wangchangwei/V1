import express from "express";
import * as projectService from "../services/project";
import * as exportService from "../services/export";
import * as fileService from "../services/file";
import * as packageService from "../services/package";

const router = express.Router();

async function resolveProjectId(id: string): Promise<string> {
  const project = await projectService.getProjectByIdOrUuid(id);
  return project.id;
}

router.get("/", async (req, res) => {
  try {
    const containers = await projectService.listProjects();
    res.json({
      success: true,
      containers,
      dockerAvailable: true,
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      containers: [],
      dockerAvailable: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/create", async (req, res) => {
  try {
    const { projectId, port, containerLike } =
      await projectService.createProject();

    res.json({
      success: true,
      containerId: projectId,
      container: containerLike,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/:containerId/start", async (req, res) => {
  const { containerId } = req.params;

  try {
    const { port } = await projectService.startProject(containerId);

    res.json({
      success: true,
      containerId,
      port,
      url: `http://localhost:${port}`,
      status: "running",
      message: "Container started successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/:containerId/stop", async (req, res) => {
  const { containerId } = req.params;

  try {
    await projectService.stopProject(containerId);

    res.json({
      success: true,
      containerId,
      status: "stopped",
      message: "Container stopped successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.delete("/:containerId", async (req, res) => {
  const { containerId } = req.params;

  try {
    await projectService.deleteProject(containerId);

    res.json({
      success: true,
      containerId,
      message: "Container deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:containerId/files", async (req, res) => {
  const { containerId } = req.params;
  const { path: containerPath = "/app/my-nextjs-app" } = req.query;

  try {
    const projectId = await resolveProjectId(containerId);
    const files = await fileService.listFiles(
      projectId,
      containerPath as string
    );

    res.json({
      success: true,
      path: containerPath,
      files,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:containerId/file-tree", async (req, res) => {
  const { containerId } = req.params;

  try {
    const projectId = await resolveProjectId(containerId);
    const fileTree = await fileService.getFileTree(projectId);

    res.json({
      success: true,
      fileTree,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:containerId/file-content-tree", async (req, res) => {
  const { containerId } = req.params;

  try {
    const projectId = await resolveProjectId(containerId);
    const fileContentTree = await fileService.getFileContentTree(projectId);

    res.json({
      success: true,
      fileContentTree,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:containerId/file", async (req, res) => {
  const { containerId } = req.params;
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      error: "File path is required",
    });
  }

  try {
    const projectId = await resolveProjectId(containerId);
    const content = await fileService.readFile(projectId, filePath as string);

    res.json({
      success: true,
      content,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.put("/:containerId/files", async (req, res) => {
  const { containerId } = req.params;
  const { path: filePath, content } = req.body;

  try {
    const projectId = await resolveProjectId(containerId);
    await fileService.writeFile(projectId, filePath, content);

    res.json({
      success: true,
      message: "File updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.put("/:containerId/files/rename", async (req, res) => {
  const { containerId } = req.params;
  const { oldPath, newPath } = req.body;

  try {
    const projectId = await resolveProjectId(containerId);
    await fileService.renameFile(projectId, oldPath, newPath);

    res.json({
      success: true,
      message: "File renamed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.delete("/:containerId/files", async (req, res) => {
  const { containerId } = req.params;
  const { path: filePath } = req.body;

  try {
    const projectId = await resolveProjectId(containerId);
    await fileService.removeFile(projectId, filePath);

    res.json({
      success: true,
      message: "File removed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/:containerId/dependencies", async (req, res) => {
  const { containerId } = req.params;
  const { packageName, isDev = false } = req.body;

  try {
    const projectId = await resolveProjectId(containerId);
    const output = await packageService.addDependency(
      projectId,
      packageName,
      isDev
    );

    res.json({
      success: true,
      message: "Dependency added successfully",
      output,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/:containerId/export", async (req, res) => {
  const { containerId } = req.params;

  try {
    const projectId = await resolveProjectId(containerId);
    const zipBuffer = await exportService.exportProjectCode(projectId);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nextjs-project-${containerId.slice(0, 8)}.zip"`
    );
    res.setHeader("Content-Length", zipBuffer.length);

    res.send(zipBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
