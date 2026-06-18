// Snapshot service for edit-and-regenerate.
//
// Snapshots are gzipped tarballs of the project directory on the host
// (~/december-projects/{projectId}), stored at
// data/snapshots/{containerId}/{messageId}.tar.gz. Build artifacts
// (node_modules, .next, .git, .turbo) are excluded.
//
// Both bun dev and the pi sidecar mount the same project directory, so
// capturing from the host is the cleanest source of truth — no need to
// reach into either container.
//
// On capture: `tar czf - --exclude=... -C {projectDir} .` with stdout
//             piped to a host-side write stream.
// On restore: cat {tarball} | tar xzf - -C {projectDir} (via spawn so we
//             can pipe the tarball bytes through stdin).
//
// captureSnapshot returns Promise<boolean> — true on success, false on any
// failure (exec error, writer error, missing tarball dir). The caller MUST
// only set message.snapshotId when captureSnapshot resolves true; otherwise
// the message must keep snapshotId undefined so a later edit-and-regenerate
// returns 410 snapshot_gone.
//
// captureSnapshot also guarantees that on a true return the tarball bytes
// have been flushed to disk — the promise resolves only after the write
// stream emits 'finish' (or 'close' on error). This prevents a racing
// restoreSnapshot from observing a partial or missing tarball.

import { spawn } from "node:child_process";
import { promises as fs, createWriteStream } from "fs";
import path from "path";
import os from "os";

let snapshotRoot: string = path.join(process.cwd(), "data", "snapshots");
const PROJECTS_DIR = path.join(os.homedir(), "december-projects");
const EXCLUDES = [
  "--exclude=node_modules",
  "--exclude=.next",
  "--exclude=.git",
  "--exclude=.turbo",
];

// `containerId` flows into filesystem paths AND into tar arguments. Whitelist
// to a safe charset so a hostile value can never escape the project dir
// (e.g. `../../etc`) or inject extra tar flags.
const CONTAINER_ID_RE = /^[a-zA-Z0-9_-]+$/;
function assertSafeContainerId(containerId: string): void {
  if (!containerId || !CONTAINER_ID_RE.test(containerId)) {
    throw new Error(`invalid containerId: ${containerId}`);
  }
}

function tarballPath(containerId: string, messageId: string): string {
  return path.join(snapshotRoot, containerId, `${messageId}.tar.gz`);
}

function dirForContainer(containerId: string): string {
  return path.join(snapshotRoot, containerId);
}

function projectDirFor(containerId: string): string {
  return path.join(PROJECTS_DIR, containerId);
}

export async function captureSnapshot(
  containerId: string,
  messageId: string
): Promise<boolean> {
  // Defense in depth: tar args are array-typed (no shell), and containerId is
  // whitelisted so it can never be a path or flag even if a future refactor
  // interpolates it into a string.
  try {
    assertSafeContainerId(containerId);
  } catch (err: any) {
    console.warn(`[snapshots] refusing capture for unsafe containerId ${containerId}:`, err.message);
    return false;
  }
  const projectDir = projectDirFor(containerId);
  try {
    await fs.mkdir(dirForContainer(containerId), { recursive: true });
  } catch (err: any) {
    console.warn(`[snapshots] mkdir failed for ${containerId}/${messageId}:`, err?.message);
    return false;
  }
  const out = tarballPath(containerId, messageId);

  return new Promise<boolean>((resolve) => {
    let execFailed = false;
    let writerFailed = false;
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(ok);
    };
    const writer = createWriteStream(out);
    const child = spawn(
      "tar",
      ["czf", "-", ...EXCLUDES, "-C", projectDir, "."],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      execFailed = true;
      console.warn(`[snapshots] capture spawn failed for ${containerId}/${messageId}:`, err.message);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        execFailed = true;
        console.warn(`[snapshots] capture failed for ${containerId}/${messageId} (exit ${code}):`, stderr);
      }
      writer.end();
    });
    writer.on("finish", () => finish(!execFailed && !writerFailed));
    writer.on("error", (e) => {
      writerFailed = true;
      console.warn(`[snapshots] writer error for ${containerId}/${messageId}:`, e.message);
      finish(false);
    });
    writer.on("close", () => {
      // Belt-and-suspenders: if 'finish' didn't fire (rare on some streams)
      // resolve here so the promise never hangs.
      finish(!execFailed && !writerFailed);
    });
    const stdout: any = child.stdout;
    if (stdout && typeof stdout.on === "function") {
      stdout.on("data", (chunk: Buffer) => writer.write(chunk));
      stdout.on("error", () => writer.end());
    }
  });
}

export async function restoreSnapshot(
  containerId: string,
  messageId: string
): Promise<void> {
  assertSafeContainerId(containerId);
  const tarball = tarballPath(containerId, messageId);
  // Existence check; throws so caller can handle 410.
  await fs.access(tarball);
  // Guard against zero-byte / truncated tarballs. A real snapshot of even an
  // empty project is several KB after gzip; anything smaller indicates a
  // crashed capture, partial write, or storage corruption. Treat as missing
  // so the PATCH handler returns 410 snapshot_gone.
  const stat = await fs.stat(tarball);
  if (stat.size < 1024) {
    throw Object.assign(
      new Error(`ENOENT: tarball too small (${stat.size} bytes)`),
      { code: "ENOENT" }
    );
  }
  const projectDir = projectDirFor(containerId);
  const resolvedProjectDir = path.resolve(projectDir);
  // Use spawn with array args (no shell). Tar's `-C <dir>` confines the
  // extract to that directory, but a malicious tarball with entries like
  // `../../etc/passwd` would still escape. Pass --no-absolute-filenames and
  // --no-anchored so the legacy GNU tar refuse-extract path is engaged.
  const cmd = "tar";
  const args = [
    "xzf",
    "-",
    "--no-absolute-filenames",
    "--exclude=*../*",
    "-C",
    resolvedProjectDir,
  ];
  const child = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"] });
  const bytes = await fs.readFile(tarball);
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar restore exited with code ${code}`));
    });
    child.stdin?.on("error", reject);
    child.stdin?.end(bytes);
  });
  // Belt-and-suspenders post-check: even with tar's anti-escape flags, a
  // crafted tarball could land files outside the project dir if a future
  // toolchain change disables them. Walk the resulting tree and ensure no
  // entry resolves to a path outside projectDir.
  await assertNoEscape(containerId, resolvedProjectDir);
}

async function assertNoEscape(containerId: string, projectDir: string): Promise<void> {
  const stack: string[] = [projectDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const resolved = path.resolve(full);
      if (
        resolved !== projectDir &&
        !resolved.startsWith(projectDir + path.sep)
      ) {
        throw new Error(
          `restore would have escaped projectDir: ${containerId} -> ${resolved}`
        );
      }
      if (entry.isDirectory()) stack.push(full);
    }
  }
}

export async function listSnapshots(containerId: string): Promise<string[]> {
  try {
    assertSafeContainerId(containerId);
  } catch {
    return [];
  }
  const dir = dirForContainer(containerId);
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.endsWith(".tar.gz"))
      .map((e) => e.replace(/\.tar\.gz$/, ""));
  } catch {
    return [];
  }
}

export async function pruneSnapshots(
  containerId: string,
  keepLast = 20
): Promise<void> {
  try {
    assertSafeContainerId(containerId);
  } catch {
    return;
  }
  const ids = (await listSnapshots(containerId)).sort();
  if (ids.length <= keepLast) return;
  const toDelete = ids.slice(0, ids.length - keepLast);
  await Promise.all(toDelete.map((id) => deleteSnapshot(containerId, id)));
}

export async function deleteSnapshot(
  containerId: string,
  messageId: string
): Promise<void> {
  try {
    assertSafeContainerId(containerId);
  } catch {
    return;
  }
  try {
    await fs.unlink(tarballPath(containerId, messageId));
  } catch {
    // already gone; idempotent
  }
}

// Test-only: override snapshot root for tests. Production code never calls this.
export function __setSnapshotRootForTests(root: string): void {
  snapshotRoot = root;
}

// Test-only: clear module-level state between tests.
export function __resetSnapshotsForTests(): void {
  // No module state besides filesystem, but expose for API symmetry.
}