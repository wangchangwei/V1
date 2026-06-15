import archiver from "archiver";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PROJECTS_DIR } from "./project";

const SKIP_DIRS = ["node_modules", ".next", ".git", ".swc", ".turbo"];

async function createProjectZip(projectId: string): Promise<Buffer> {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  const tempDir = path.join(os.tmpdir(), `deploy-${projectId}-${Date.now()}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Copy project files, skipping heavy directories
    await copyDirRecursive(projectDir, tempDir);

    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", (err: Error) => { throw err; });

    archive.directory(tempDir, false);
    await new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", reject);
      archive.finalize();
    });

    await fs.rm(tempDir, { recursive: true, force: true });
    return Buffer.concat(chunks);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function copyDirRecursive(srcDir: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_DIRS.includes(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export interface DeployResult {
  url: string;
  deploymentId: string;
  status: string;
}

export async function deployToVercel(
  projectId: string,
  vercelToken: string,
  onProgress?: (msg: string) => void
): Promise<DeployResult> {
  const zipBuffer = await createProjectZip(projectId);
  onProgress?.("Zip created, uploading to Vercel...");

  // Create a deployment via Vercel REST API
  const formData = new FormData();
  const fileBlob = new Blob([zipBuffer], { type: "application/zip" });
  formData.append("file", fileBlob, "project.zip");
  formData.append("project", "nextjs");
  formData.append("token", vercelToken);
  formData.append("force", "true");

  const response = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Vercel deploy failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json() as { id?: string; url?: string; name?: string; status?: string };
  return {
    url: data.url ?? `https://${data.name ?? "project"}.vercel.app`,
    deploymentId: data.id ?? "",
    status: data.status ?? "deployed",
  };
}
