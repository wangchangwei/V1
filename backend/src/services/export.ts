import archiver from "archiver";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PROJECTS_DIR } from "./project";

const SKIP_DIRS = ["node_modules", ".next", ".git"];

async function copyDirRecursive(
  srcDir: string,
  destDir: string
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const ent of entries) {
    if (SKIP_DIRS.includes(ent.name)) continue;
    const srcPath = path.join(srcDir, ent.name);
    const destPath = path.join(destDir, ent.name);

    if (ent.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function exportProjectCode(projectId: string): Promise<Buffer> {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  const tempDir = path.join(os.tmpdir(), `export-${projectId}-${Date.now()}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await copyDirRecursive(projectDir, tempDir);

    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", (err: Error) => {
      throw err;
    });

    archive.directory(tempDir, false);
    await new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", reject);
      archive.finalize();
    });

    await fs.rm(tempDir, { recursive: true, force: true });
    return Buffer.concat(chunks);
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Export failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
