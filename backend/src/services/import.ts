import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { PROJECTS_DIR } from "./project";

const execAsync = promisify(exec);

async function runBunInstall(projectDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["install"], {
      cwd: projectDir,
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bun install failed: ${stderr || code}`));
    });
    child.on("error", reject);
  });
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// 从 ZIP 导入
export async function importFromZip(
  zipBuffer: Buffer,
  originalName: string
): Promise<string> {
  const projectId = uuidv4();
  const projectDir = path.join(PROJECTS_DIR, projectId);
  await fs.mkdir(projectDir, { recursive: true });

  // 把 zip 写到临时目录再解压
  const tmpZip = path.join(os.tmpdir(), `dec-import-${projectId}.zip`);
  await fs.writeFile(tmpZip, zipBuffer);

  try {
    // Windows 用 PowerShell Expand-Archive，Linux/Mac 用 unzip
    if (process.platform === "win32") {
      await execAsync(
        `powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${projectDir}' -Force"`,
        { timeout: 60000 }
      );
    } else {
      await execAsync(`unzip -o "${tmpZip}" -d "${projectDir}"`, { timeout: 60000 });
    }

    // 如果 zip 解压出了单个根目录，把内容移上来
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    if (entries.length === 1 && entries[0].isDirectory()) {
      const innerDir = path.join(projectDir, entries[0].name);
      const innerEntries = await fs.readdir(innerDir, { withFileTypes: true });
      for (const e of innerEntries) {
        await fs.rename(path.join(innerDir, e.name), path.join(projectDir, e.name));
      }
      await fs.rmdir(innerDir);
    }
  } finally {
    await fs.rm(tmpZip, { force: true });
  }

  console.log(`[import] ZIP extracted to ${projectDir}, installing deps...`);
  await runBunInstall(projectDir);
  return projectId;
}

// 从 GitHub URL 导入，可指定分支
export async function importFromGitHub(githubUrl: string, branch?: string): Promise<string> {
  const projectId = uuidv4();
  const projectDir = path.join(PROJECTS_DIR, projectId);
  await fs.mkdir(projectDir, { recursive: true });

  // 标准化 URL
  let cloneUrl = githubUrl.trim();
  if (!cloneUrl.endsWith(".git")) cloneUrl += ".git";
  if (!cloneUrl.startsWith("http") && !cloneUrl.startsWith("git@")) {
    cloneUrl = `https://github.com/${cloneUrl}`;
  }

  const branchArg = branch && branch.trim() ? `--branch "${branch.trim()}"` : "";
  const cmd = `git clone --depth 1 ${branchArg} "${cloneUrl}" .`.replace(/\s+/g, " ");

  console.log(`[import] Cloning ${cloneUrl}${branch ? ` (branch: ${branch})` : ""} into ${projectDir}...`);
  try {
    await execAsync(cmd, { cwd: projectDir, timeout: 120000 });
  } catch (err) {
    await fs.rm(projectDir, { recursive: true, force: true });
    throw new Error(
      `Git clone failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 删除 .git 目录，避免与项目管理冲突
  await fs.rm(path.join(projectDir, ".git"), { recursive: true, force: true });

  console.log(`[import] Cloned, installing deps...`);
  await runBunInstall(projectDir);
  return projectId;
}
