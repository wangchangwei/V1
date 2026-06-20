import express from "express";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import * as projectService from "../services/project";
import { PROJECTS_DIR } from "../services/project";
import * as exportService from "../services/export";
import * as fileService from "../services/file";
import * as packageService from "../services/package";
import * as importService from "../services/import";

const execAsync = promisify(exec);

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
      url: `http://127.0.0.1:${port}`,
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

router.patch("/:containerId", async (req, res) => {
  const { containerId } = req.params;
  const { displayName } = req.body;

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    res.status(400).json({ success: false, error: "displayName is required" });
    return;
  }

  try {
    await projectService.updateProjectDisplayName(containerId, displayName.trim());
    res.json({ success: true, displayName: displayName.trim() });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
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

// 推送到 GitHub
//@ts-ignore
router.post("/:containerId/push/github", async (req, res) => {
  const { containerId } = req.params;
  const { repoUrl, token, branch } = req.body;

  if (!repoUrl || typeof repoUrl !== "string") {
    return res.status(400).json({ success: false, error: "repoUrl is required" });
  }
  if (!token || typeof token !== "string") {
    return res.status(400).json({ success: false, error: "token is required" });
  }

  const projectDir = path.join(PROJECTS_DIR, containerId);
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ success: false, error: "Project not found" });
  }

  try {
    // 判断是否已是 git 仓库
    let isGitRepo = false;
    try {
      await fs.access(path.join(projectDir, ".git"));
      isGitRepo = true;
    } catch { isGitRepo = false; }

    const normalizedRepo = repoUrl.trim().replace(/\.git$/, "");
    const authRepoUrl = `https://${token}@github.com/${normalizedRepo.replace("https://github.com/", "")}.git`;

    if (isGitRepo) {
      // 已有仓库，直接 push
      await execAsync(`git remote set-url origin "${authRepoUrl}"`, { cwd: projectDir });
      await execAsync(`git checkout ${branch || "main"} 2>/dev/null || git checkout -b ${branch || "main"}`, { cwd: projectDir });
      await execAsync(`git add -A && git commit -m "Update from V1" --allow-empty`, { cwd: projectDir });
      await execAsync(`git push -u origin ${branch || "main"} --force`, { cwd: projectDir, timeout: 60000 });
    } else {
      // 新建 git 仓库
      await execAsync(`git init`, { cwd: projectDir });
      await execAsync(`git remote add origin "${authRepoUrl}"`, { cwd: projectDir });
      await execAsync(`git checkout -b ${branch || "main"}`, { cwd: projectDir });
      await execAsync(`git add -A && git commit -m "Initial commit from V1"`, { cwd: projectDir });
      await execAsync(`git push -u origin ${branch || "main"}`, { cwd: projectDir, timeout: 60000 });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Push failed" });
  }
});

// Git Commit
//@ts-ignore
router.post("/:containerId/git/commit", async (req, res) => {
  const { containerId } = req.params;
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ success: false, error: "message is required" });
  }
  const projectDir = path.join(PROJECTS_DIR, containerId);
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ success: false, error: "Project not found" });
  }
  try {
    let isGitRepo = false;
    try {
      await fs.access(path.join(projectDir, ".git"));
      isGitRepo = true;
    } catch { isGitRepo = false; }
    if (!isGitRepo) {
      await execAsync(`git init`, { cwd: projectDir });
    }
    await execAsync(`git add -A`, { cwd: projectDir });
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: projectDir });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Commit failed" });
  }
});

// Git Pull
//@ts-ignore
router.post("/:containerId/git/pull", async (req, res) => {
  const { containerId } = req.params;
  const { repoUrl, token, branch } = req.body;
  if (!repoUrl || typeof repoUrl !== "string") {
    return res.status(400).json({ success: false, error: "repoUrl is required" });
  }
  if (!token || typeof token !== "string") {
    return res.status(400).json({ success: false, error: "token is required" });
  }
  const projectDir = path.join(PROJECTS_DIR, containerId);
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ success: false, error: "Project not found" });
  }
  try {
    const normalizedRepo = repoUrl.trim().replace(/\.git$/, "");
    const authRepoUrl = `https://${token}@github.com/${normalizedRepo.replace("https://github.com/", "")}.git`;
    let isGitRepo = false;
    try {
      await fs.access(path.join(projectDir, ".git"));
      isGitRepo = true;
    } catch { isGitRepo = false; }
    if (!isGitRepo) {
      await execAsync(`git init`, { cwd: projectDir });
      await execAsync(`git remote add origin "${authRepoUrl}"`, { cwd: projectDir });
    } else {
      await execAsync(`git remote set-url origin "${authRepoUrl}"`, { cwd: projectDir });
    }
    await execAsync(`git fetch origin`, { cwd: projectDir, timeout: 60000 });
    await execAsync(`git checkout ${branch || "main"} 2>/dev/null || git checkout -b ${branch || "main"}`, { cwd: projectDir });
    await execAsync(`git pull origin ${branch || "main"}`, { cwd: projectDir, timeout: 60000 });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Pull failed" });
  }
});

// 获取 GitHub 连接状态
//@ts-ignore
router.get("/:containerId/github", async (req, res) => {
  const { containerId } = req.params;
  try {
    const info = await projectService.getProjectGithub(containerId);
    res.json({ success: true, ...info });
  } catch (error) {
    res.status(404).json({ success: false, error: "Project not found" });
  }
});

// 连接 GitHub 仓库
//@ts-ignore
router.post("/:containerId/github/connect", async (req, res) => {
  const { containerId } = req.params;
  const { repoUrl, token, branch } = req.body;
  if (!repoUrl || typeof repoUrl !== "string") {
    return res.status(400).json({ success: false, error: "repoUrl is required" });
  }
  if (!token || typeof token !== "string") {
    return res.status(400).json({ success: false, error: "token is required" });
  }
  const projectDir = path.join(PROJECTS_DIR, containerId);
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ success: false, error: "Project not found" });
  }
  try {
    const normalizedRepo = repoUrl.trim().replace(/\.git$/, "");
    const authRepoUrl = `https://${token}@github.com/${normalizedRepo.replace("https://github.com/", "")}.git`;
    let isGitRepo = false;
    try {
      await fs.access(path.join(projectDir, ".git"));
      isGitRepo = true;
    } catch { isGitRepo = false; }
    if (!isGitRepo) {
      await execAsync(`git init`, { cwd: projectDir });
    }
    await execAsync(`git remote set-url origin "${authRepoUrl}"`, { cwd: projectDir });
    await projectService.setProjectGithub(containerId, normalizedRepo, branch || "main");
    res.json({ success: true, repo: normalizedRepo, branch: branch || "main" });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Connect failed" });
  }
});

// 从 GitHub URL 导入
//@ts-ignore
router.post("/import/github", async (req, res) => {
  const { githubUrl, branch } = req.body;
  if (!githubUrl || typeof githubUrl !== "string") {
    return res.status(400).json({ success: false, error: "githubUrl is required" });
  }
  try {
    const projectId = await importService.importFromGitHub(githubUrl, branch);
    const { port, containerLike } = await projectService.registerAndStartProject(projectId);
    res.json({ success: true, containerId: projectId, port, container: containerLike });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// 从 ZIP 文件导入（multipart/form-data，字段名 file）
//@ts-ignore
router.post("/import/zip", async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let filename = "project.zip";

    await new Promise<void>((resolve, reject) => {
      const boundary = (() => {
        const ct = req.headers["content-type"] || "";
        const m = ct.match(/boundary=([^\s;]+)/);
        return m ? m[1] : null;
      })();

      if (!boundary) return reject(new Error("No multipart boundary found"));

      let rawBody = Buffer.alloc(0);
      req.on("data", (chunk: Buffer) => { rawBody = Buffer.concat([rawBody, chunk]); });
      req.on("end", () => {
        // 简单解析 multipart：找到第一个文件 part 的内容
        const boundaryBuf = Buffer.from(`--${boundary}`);
        const parts = splitBuffer(rawBody, boundaryBuf);
        for (const part of parts) {
          const headerEnd = indexOfBytes(part, Buffer.from("\r\n\r\n"));
          if (headerEnd === -1) continue;
          const header = part.slice(0, headerEnd).toString();
          if (!header.includes("filename")) continue;
          const fnMatch = header.match(/filename="([^"]+)"/);
          if (fnMatch) filename = fnMatch[1];
          // 内容在 \r\n\r\n 之后，去掉末尾的 \r\n
          const content = part.slice(headerEnd + 4);
          const trimmed = content.slice(0, content.length - 2);
          chunks.push(trimmed);
          break;
        }
        resolve();
      });
      req.on("error", reject);
    });

    if (chunks.length === 0) {
      return res.status(400).json({ success: false, error: "No zip file found in request" });
    }

    const zipBuffer = Buffer.concat(chunks);
    const projectId = await importService.importFromZip(zipBuffer, filename);
    const { port, containerLike } = await projectService.registerAndStartProject(projectId);
    res.json({ success: true, containerId: projectId, port, container: containerLike });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

function splitBuffer(buf: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = indexOfBytes(buf, delimiter, start);
    if (idx === -1) break;
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
  }
  parts.push(buf.slice(start));
  return parts;
}

function indexOfBytes(buf: Buffer, search: Buffer, offset = 0): number {
  for (let i = offset; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

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
