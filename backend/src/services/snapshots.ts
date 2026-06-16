// Snapshot service for edit-and-regenerate.
//
// Snapshots are gzipped tarballs of a Docker container's /app directory,
// stored on the host at data/snapshots/{containerId}/{messageId}.tar.gz.
// Build artifacts (node_modules, .next, .git, .turbo) are excluded.
//
// On capture: `docker exec {cid} tar czf - --exclude=... -C /app .`
//             with stdout piped to a host-side write stream.
// On restore: cat {tarball} | docker exec -i {cid} tar xzf - -C /app
//             pipes the file back into the container.
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

import { exec } from "node:child_process";
import { promises as fs, createWriteStream } from "fs";
import path from "path";

let snapshotRoot: string = path.join(process.cwd(), "data", "snapshots");
const EXCLUDES = [
  "--exclude=node_modules",
  "--exclude=.next",
  "--exclude=.git",
  "--exclude=.turbo",
];

function tarballPath(containerId: string, messageId: string): string {
  return path.join(snapshotRoot, containerId, `${messageId}.tar.gz`);
}

function dirForContainer(containerId: string): string {
  return path.join(snapshotRoot, containerId);
}

export async function captureSnapshot(
  containerId: string,
  messageId: string
): Promise<boolean> {
  try {
    await fs.mkdir(dirForContainer(containerId), { recursive: true });
  } catch (err: any) {
    console.warn(`[snapshots] mkdir failed for ${containerId}/${messageId}:`, err?.message);
    return false;
  }
  const out = tarballPath(containerId, messageId);
  const cmd = `docker exec ${containerId} tar czf - ${EXCLUDES.join(" ")} -C /app .`;

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
    const child = exec(cmd, (err) => {
      if (err) {
        execFailed = true;
        console.warn(`[snapshots] capture failed for ${containerId}/${messageId}:`, err.message);
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
  const tarball = tarballPath(containerId, messageId);
  // Existence check; throws so caller can handle 410.
  await fs.access(tarball);
  const bytes = await fs.readFile(tarball);
  const cmd = `docker exec -i ${containerId} tar xzf - -C /app`;
  return new Promise((resolve, reject) => {
    const child = exec(cmd, (err) => (err ? reject(err) : resolve()));
    const stdin: any = child.stdin;
    if (stdin && typeof stdin.write === "function") {
      stdin.write(bytes);
      stdin.end();
    }
  });
}

export async function listSnapshots(containerId: string): Promise<string[]> {
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