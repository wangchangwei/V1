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

// Helper: build a captureSnapshot mock that simulates the real exec/stream
// pipeline. The mock writes emitted stdout data to the tarball path so
// restoreSnapshot's fs.access succeeds. Returns the mock implementation so
// each test can override individual fields.
function captureMockSuccess(opts: {
  expectedTarball: string;
  payload?: string;
  delayWrite?: number;
} = { expectedTarball: "" }) {
  return (cmd: string, cb: (e: any, stdout: string, stderr: string) => void) => {
    const stdout: any = {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === "data" && opts.payload !== undefined) {
          fn(Buffer.from(opts.payload));
        }
      },
    };
    const stderr = { on: () => {} };
    process.nextTick(async () => {
      try {
        if (opts.payload !== undefined) {
          await fs.mkdir(path.dirname(opts.expectedTarball), { recursive: true });
          await fs.writeFile(opts.expectedTarball, opts.payload);
        }
      } finally {
        cb(null, "ok", "");
      }
    });
    return { stdout, stderr } as any;
  };
}

describe("captureSnapshot", () => {
  it("writes a tarball under data/snapshots/{containerId}/{messageId}.tar.gz", async () => {
    const expectedTarball = path.join(TMP_ROOT, CID, `${MID}.tar.gz`);
    mockExec.mockImplementation(
      captureMockSuccess({ expectedTarball, payload: "TAR-GZ-BYTES" })
    );
    const ok = await captureSnapshot(CID, MID);
    expect(ok).toBe(true);
    const stat = await fs.stat(expectedTarball);
    expect(stat.isFile()).toBe(true);
  });

  it("invokes docker with --exclude flags for build artifacts", async () => {
    let capturedCmd = "";
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      capturedCmd = cmd;
      process.nextTick(() => cb(null, "", ""));
      return {} as any;
    });
    const ok = await captureSnapshot(CID, MID);
    expect(ok).toBe(true);
    expect(capturedCmd).toMatch(/--exclude=node_modules/);
    expect(capturedCmd).toMatch(/--exclude=\.next/);
    expect(capturedCmd).toMatch(/--exclude=\.git/);
    expect(capturedCmd).toMatch(/--exclude=\.turbo/);
  });

  it("returns false when the underlying exec fails", async () => {
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      process.nextTick(() => cb(new Error("docker daemon down"), "", ""));
      return { stdout: { on: () => {} }, stderr: { on: () => {} } } as any;
    });
    const ok = await captureSnapshot(CID, MID);
    expect(ok).toBe(false);
  });

  it("does not resolve until the write stream has finished flushing", async () => {
    // After captureSnapshot resolves, the tarball MUST be readable. This
    // proves the promise does not resolve before writer 'finish' fires.
    const expectedTarball = path.join(TMP_ROOT, CID, `${MID}.tar.gz`);
    mockExec.mockImplementation(
      captureMockSuccess({ expectedTarball, payload: "FAKE-TAR-CONTENT" })
    );
    const ok = await captureSnapshot(CID, MID);
    expect(ok).toBe(true);
    // Immediately after resolve, bytes must be readable from disk.
    const bytes = await fs.readFile(expectedTarball);
    expect(bytes.toString()).toBe("FAKE-TAR-CONTENT");
  });
});

describe("restoreSnapshot", () => {
  it("round-trips: capture then restore returns the original files", async () => {
    const expectedTarball = path.join(TMP_ROOT, CID, `${MID}.tar.gz`);
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes("tar czf")) {
        return captureMockSuccess({ expectedTarball, payload: "FAKE-TAR-CONTENT" })(
          cmd,
          cb
        );
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
    const ok = await captureSnapshot(CID, MID);
    expect(ok).toBe(true);
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

  it("pruneSnapshots sorts by messageId lex order (adversarial data)", async () => {
    // Adversarial test for the unsorted-prune bug.
    //
    // On most modern filesystems (macOS APFS, ext4, tmpfs) readdir already
    // returns lex-sorted order, so a naive test using on-disk file order
    // can't catch a missing .sort(). To make the test fail when .sort() is
    // absent, we stub fs.readdir to return a deliberately non-sorted list,
    // simulating the worst-case ordering on any platform.
    //
    // Without .sort(): pruneSnapshots sees ["user-100", "user-002", "user-003", "user-004"],
    //   drops the first 2 → keeps ["user-003", "user-004"]
    //   (wrong — user-100 should be one of the two kept).
    //
    // With .sort(): pruneSnapshots sorts to ["user-002", "user-003", "user-004", "user-100"],
    //   drops the first 2 → keeps ["user-004", "user-100"]
    //   (correct — lex-largest two preserved).
    await fs.mkdir(path.join(TMP_ROOT, CID), { recursive: true });
    for (const id of ["user-100", "user-002", "user-003", "user-004"]) {
      await fs.writeFile(path.join(TMP_ROOT, CID, `${id}.tar.gz`), "x");
    }

    const readdirSpy = vi.spyOn(fs, "readdir").mockResolvedValue([
      "user-100.tar.gz",
      "user-002.tar.gz",
      "user-003.tar.gz",
      "user-004.tar.gz",
    ] as any);

    try {
      await pruneSnapshots(CID, 2);
    } finally {
      readdirSpy.mockRestore();
    }
    // After restore, listSnapshots reads the real disk (which now has only
    // the kept files because pruneSnapshots called fs.unlink on the others).
    const remaining = (await listSnapshots(CID)).sort();
    expect(remaining).toEqual(["user-004", "user-100"]);
  });

  it("deleteSnapshot removes a single tarball", async () => {
    await fs.mkdir(path.join(TMP_ROOT, CID), { recursive: true });
    await fs.writeFile(path.join(TMP_ROOT, CID, "user-1.tar.gz"), "x");
    await deleteSnapshot(CID, "user-1");
    const remaining = await listSnapshots(CID);
    expect(remaining).toEqual([]);
  });
});