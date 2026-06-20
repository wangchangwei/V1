// E2B Sandbox lifecycle manager.
// Replaces bun dev spawn with E2B cloud sandbox for frontend code execution.

import { Sandbox, waitForPort, waitForURL } from "e2b";
import { getFileContentTree, writeFile as writeHostFile } from "./file";

const E2B_API_KEY = process.env.E2B_API_KEY;
const E2B_TIMEOUT = Number(process.env.E2B_SANDBOX_TIMEOUT ?? 300) * 1000; // ms
const E2B_DEV_PORT = 3000;

export interface E2BHandle {
  sandboxId: string;
  sandboxDomain: string;
  previewUrl: string;
  sandbox: Sandbox;
}

// In-memory registry: projectId → E2BHandle
const runningSandboxes: Map<string, E2BHandle> = new Map();

export function hasE2BSandbox(projectId: string): boolean {
  return runningSandboxes.has(projectId);
}

export function getE2BSandbox(projectId: string): E2BHandle | undefined {
  return runningSandboxes.get(projectId);
}

export async function startE2BSandbox(projectId: string): Promise<E2BHandle> {
  // Return existing if already running
  const existing = runningSandboxes.get(projectId);
  if (existing && existing.sandbox.isRunning()) {
    return existing;
  }

  // Clean up stale entry if exists
  if (existing) {
    try {
      await existing.sandbox.kill();
    } catch (_) {}
    runningSandboxes.delete(projectId);
  }

  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY,
    metadata: { projectId },
    timeout: E2B_TIMEOUT,
  });

  const handle: E2BHandle = {
    sandboxId: sandbox.sandboxId,
    sandboxDomain: sandbox.sandboxDomain,
    previewUrl: sandbox.getHost(E2B_DEV_PORT),
    sandbox,
  };

  runningSandboxes.set(projectId, handle);

  // Sync project files into sandbox
  await syncHostToSandbox(projectId, sandbox);

  // Start dev server in background
  sandbox.commands.start("cd /home/user && bun run dev", {
    cwd: "/home/user",
    background: true,
  });

  // Wait for dev server to be ready
  try {
    await waitForPort(E2B_DEV_PORT, {
      sandboxId: sandbox.sandboxId,
      timeout: 60_000,
    });
    // Also wait for the URL to be reachable
    await waitForURL(handle.previewUrl, { timeout: 30_000 }).catch(() => {});
  } catch (err) {
    console.warn(`[e2b] dev server may not be ready for ${projectId}:`, err);
  }

  return handle;
}

export async function stopE2BSandbox(projectId: string): Promise<void> {
  const handle = runningSandboxes.get(projectId);
  if (!handle) return;

  try {
    await handle.sandbox.kill();
  } catch (err) {
    console.warn(`[e2b] failed to kill sandbox ${projectId}:`, err);
  }
  runningSandboxes.delete(projectId);
}

export async function restartE2BSandbox(projectId: string): Promise<E2BHandle> {
  await stopE2BSandbox(projectId);
  return startE2BSandbox(projectId);
}

// Sync all project files from host FS to E2B sandbox
async function syncHostToSandbox(projectId: string, sandbox: Sandbox): Promise<void> {
  try {
    const files = await getFileContentTree(projectId);

    for (const entry of files) {
      await syncEntry(entry, "/home/user", sandbox);
    }

    console.log(`[e2b] Synced files to sandbox for project ${projectId}`);
  } catch (err) {
    console.error(`[e2b] Failed to sync files for ${projectId}:`, err);
  }
}

async function syncEntry(
  entry: { name: string; path: string; type: string; content?: string; children?: any[] },
  basePath: string,
  sandbox: Sandbox
): Promise<void> {
  const fullPath = `${basePath}/${entry.name}`;

  if (entry.type === "directory" && entry.children) {
    // Create dir in sandbox
    try {
      await sandbox.files.makeDir(fullPath, { parents: true });
    } catch (_) {}
    for (const child of entry.children) {
      await syncEntry(child, fullPath, sandbox);
    }
  } else if (entry.type === "file" && entry.content !== undefined) {
    await sandbox.files.write(fullPath, entry.content);
  }
}

// Write a file to both host FS and E2B sandbox
export async function writeFileToSandbox(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  // Write to host (source of truth)
  await writeHostFile(projectId, filePath, content);

  // Write to sandbox if running
  const handle = runningSandboxes.get(projectId);
  if (handle && handle.sandbox.isRunning()) {
    try {
      await handle.sandbox.files.write(`/home/user/${filePath}`, content);
    } catch (err) {
      console.warn(`[e2b] Failed to write file in sandbox ${projectId}:`, err);
    }
  }
}

// Delete sandbox on process exit
process.on("exit", () => {
  for (const [projectId, handle] of runningSandboxes) {
    try {
      handle.sandbox.kill();
    } catch (_) {}
  }
});
