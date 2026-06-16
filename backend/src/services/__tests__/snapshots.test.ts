import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Mock docker exec BEFORE importing the module under test.
const mockExec = vi.fn();
vi.mock("node:child_process", () => ({
  exec: (cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) =>
    mockExec(cmd, cb),
}));

import {
  captureSnapshot,
  restoreSnapshot,
  listSnapshots,
  pruneSnapshots,
  deleteSnapshot,
  __resetSnapshotsForTests,
  __setSnapshotRootForTests,
} from "../snapshots";

const TMP_ROOT = path.join(os.tmpdir(), "v1-snapshots-test");
const CID = "test-container";
const MID = "user-123";

beforeEach(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
  await fs.mkdir(TMP_ROOT, { recursive: true });
  __setSnapshotRootForTests(TMP_ROOT);
  __resetSnapshotsForTests();
  mockExec.mockReset();
});

afterEach(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});

describe("captureSnapshot", () => {
  it("writes a tarball under data/snapshots/{containerId}/{messageId}.tar.gz", async () => {
    mockExec.mockImplementation(
      (cmd: string, cb: (e: null, stdout: string, stderr: string) => void) => {
        process.nextTick(() => cb(null, "TAR-GZ-BYTES", ""));
        return { stdout: { on: () => {} }, stderr: { on: () => {} } } as any;
      }
    );
    await captureSnapshot(CID, MID);
    const tarballPath = path.join(TMP_ROOT, CID, `${MID}.tar.gz`);
    const stat = await fs.stat(tarballPath);
    expect(stat.isFile()).toBe(true);
  });

  it("invokes docker with --exclude flags for build artifacts", async () => {
    let capturedCmd = "";
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      capturedCmd = cmd;
      process.nextTick(() => cb(null, "", ""));
      return {} as any;
    });
    await captureSnapshot(CID, MID);
    expect(capturedCmd).toMatch(/--exclude=node_modules/);
    expect(capturedCmd).toMatch(/--exclude=\.next/);
    expect(capturedCmd).toMatch(/--exclude=\.git/);
    expect(capturedCmd).toMatch(/--exclude=\.turbo/);
  });
});

describe("restoreSnapshot", () => {
  it("round-trips: capture then restore returns the original files", async () => {
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes("tar czf")) {
        const stdout = {
          on: (event: string, fn: (data: Buffer) => void) => {
            if (event === "data") fn(Buffer.from("FAKE-TAR-CONTENT"));
          },
        };
        const stderr = { on: () => {} };
        process.nextTick(() => cb(null, "ok", ""));
        return { stdout, stderr } as any;
      }
      if (cmd.includes("docker exec -i")) {
        const stdinChunks: Buffer[] = [];
        const stdin = {
          write: (data: Buffer) => stdinChunks.push(data),
          end: () => {},
        };
        process.nextTick(() => {
          expect(Buffer.concat(stdinChunks).toString()).toBe("FAKE-TAR-CONTENT");
          cb(null, "", "");
        });
        return { stdin } as any;
      }
      return {} as any;
    });
    await captureSnapshot(CID, MID);
    await restoreSnapshot(CID, MID);
  });
});

describe("listSnapshots / pruneSnapshots / deleteSnapshot", () => {
  it("listSnapshots returns messageIds that have tarballs on disk", async () => {
    await fs.mkdir(path.join(TMP_ROOT, CID), { recursive: true });
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-1.tar.gz"), "x");
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-2.tar.gz"), "y");
    const ids = await listSnapshots(CID);
    expect(ids.sort()).toEqual(["user-1", "user-2"]);
  });

  it("pruneSnapshots keeps the last N by messageId order", async () => {
    await fs.mkdir(path.join(TMP_ROOT, CID), { recursive: true });
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-1.tar.gz"), "x");
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-2.tar.gz"), "x");
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-3.tar.gz"), "x");
    await pruneSnapshots(CID, 2);
    const remaining = await listSnapshots(CID);
    expect(remaining.sort()).toEqual(["user-2", "user-3"]);
  });

  it("deleteSnapshot removes a single tarball", async () => {
    await fs.mkdir(path.join(TMP_ROOT, CID), { recursive: true });
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-1.tar.gz"), "x");
    await deleteSnapshot(CID, "user-1");
    const remaining = await listSnapshots(CID);
    expect(remaining).toEqual([]);
  });
});
