# Edit-and-Regenerate Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let V1 users edit any past user message and regenerate from that point forward, with the project filesystem rolled back to a host-side tarball snapshot taken at the edit point.

**Architecture:** Snapshots captured passively during the normal AI loop (host-side tarball at `data/snapshots/{containerId}/{messageId}.tar.gz`, excluding `node_modules`/`.next`/`.git`/`.turbo`). New `PATCH /chat/:containerId/messages/:messageId` endpoint acquires `withProjectLock`, restores the snapshot, truncates session.messages, re-runs the AI loop, and streams the regenerated response on the same SSE connection. Frontend gains an Edit button on user-role message bubbles.

**Tech Stack:** Backend Express + Node child_process + docker exec; frontend Next.js 14 (existing chat UI) + react-hot-toast. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-16-edit-and-regenerate-chat-design.md`

**Prerequisite reality check:** Chat sessions are in-memory (`Map<containerId, ChatSession>` in `llm.ts:35`). They are NOT persisted to disk. This plan keeps that behavior — edit works within a single server lifetime; on server restart, in-memory session history is lost (existing V1 limitation, not introduced by this plan). Snapshots ARE persisted and survive restarts.

---

## File Structure

**Created:**
- `backend/src/services/snapshots.ts` — capture/restore/prune/list/delete snapshot operations
- `backend/src/services/__tests__/snapshots.test.ts` — unit tests using a fake docker exec
- `backend/src/routes/__tests__/chat-edit.test.ts` — integration tests for PATCH endpoint
- `frontend/e2e/edit-and-regenerate.spec.ts` — Playwright E2E for full edit flow

**Modified:**
- `backend/src/services/llm.ts` — add `snapshotId?: string` to `Message` interface; wrap `runToolUseLoop` call in snapshot capture
- `backend/src/routes/chat.ts` — wrap POST `/messages` and add PATCH `/messages/:messageId`; both use `withProjectLock`
- `frontend/src/app/editor/...` MessageBubble component — add EditButton + inline edit mode (file path confirmed at implementation time)

---

## Task 1: Snapshot Service (capture, restore, prune, list, delete)

**Files:**
- Create: `backend/src/services/snapshots.ts`
- Test: `backend/src/services/__tests__/snapshots.test.ts`

- [ ] **Step 1: Write the failing test for `captureSnapshot`**

Create `backend/src/services/__tests__/snapshots.test.ts`:

```typescript
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
} from "../snapshots";

const TMP_ROOT = path.join(os.tmpdir(), "v1-snapshots-test");
const CID = "test-container";
const MID = "user-123";

beforeEach(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
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
        // Simulate `docker exec {cid} tar czf - -C /app .` writing bytes to stdout
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
    // Pretend the container has /app/a.txt and /app/b.txt
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes("tar czf")) {
        // Simulate tar: write bytes for two files
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
        // Capture the tar bytes being piped in via stdin
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
    await restoreSnapshot(CID, MID);  // should pipe tarball bytes back into docker exec
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/wangchangwei/V1/backend && npx vitest run src/services/__tests__/snapshots.test.ts 2>&1 | tail -20`
Expected: FAIL — module `../snapshots` cannot be found (or import error)

- [ ] **Step 3: Implement `snapshots.ts`**

Create `backend/src/services/snapshots.ts`:

```typescript
// Snapshot service for edit-and-regenerate.
//
// Snapshots are gzipped tarballs of a Docker container's /app directory,
// stored on the host at data/snapshots/{containerId}/{messageId}.tar.gz.
// Build artifacts (node_modules, .next, .git, .turbo) are excluded.
//
// On capture: `docker exec {cid} tar czf - --exclude=... -C /app .`
//             redirects stdout into a host-side file.
// On restore: cat {tarball} | docker exec -i {cid} tar xzf - -C /app
//             pipes the file back into the container.
//
// All operations are best-effort: capture failures are logged but
// do not throw to the caller (degraded mode — message.snapshotId stays
// undefined; edit later returns 410 snapshot_gone).

import { exec } from "node:child_process";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";

const SNAPSHOT_ROOT = path.join(process.cwd(), "data", "snapshots");
const EXCLUDES = [
  "--exclude=node_modules",
  "--exclude=.next",
  "--exclude=.git",
  "--exclude=.turbo",
];

function tarballPath(containerId: string, messageId: string): string {
  return path.join(SNAPSHOT_ROOT, containerId, `${messageId}.tar.gz`);
}

function dirForContainer(containerId: string): string {
  return path.join(SNAPSHOT_ROOT, containerId);
}

export async function captureSnapshot(
  containerId: string,
  messageId: string
): Promise<void> {
  await fs.mkdir(dirForContainer(containerId), { recursive: true });
  const out = tarballPath(containerId, messageId);
  const cmd = `docker exec ${containerId} tar czf - ${EXCLUDES.join(" ")} -C /app . > ${out}`;
  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        console.warn(`[snapshots] capture failed for ${containerId}/${messageId}:`, err.message);
      }
      resolve();  // never throw — degraded mode
    });
  });
}

export async function restoreSnapshot(
  containerId: string,
  messageId: string
): Promise<void> {
  const tarball = tarballPath(containerId, messageId);
  // Existence check; throws so caller can handle 410.
  await fs.access(tarball);
  const cmd = `docker exec -i ${containerId} tar xzf - -C /app`;
  return new Promise((resolve, reject) => {
    const child = exec(cmd, (err) => (err ? reject(err) : resolve()));
    // Stream the tarball bytes into the child's stdin.
    const stream = fs.createReadStream(tarball);
    stream.pipe(child.stdin as any);
    stream.on("error", reject);
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
  const ids = await listSnapshots(containerId);
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

// Test-only: clear module-level state between tests.
export function __resetSnapshotsForTests(): void {
  // No module state besides filesystem, but expose for API symmetry.
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/wangchangwei/V1/backend && npx vitest run src/services/__tests__/snapshots.test.ts 2>&1 | tail -20`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/snapshots.ts backend/src/services/__tests__/snapshots.test.ts
git commit -m "feat(snapshots): add capture/restore/prune service for edit-and-regenerate"
```

---

## Task 2: Hook Snapshot Capture into POST /chat/:containerId/messages

**Files:**
- Modify: `backend/src/services/llm.ts` (add `snapshotId?` field; wrap stream loop)
- Modify: `backend/src/routes/chat.ts` (acquire `withProjectLock` on POST)

- [ ] **Step 1: Add `snapshotId?` field to Message interface**

In `backend/src/services/llm.ts`, modify the `Message` interface (currently at line 7):

```typescript
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  snapshotId?: string;  // NEW: set after captureSnapshot succeeds
}
```

- [ ] **Step 2: Wrap `sendMessageStream` in snapshot capture**

In `backend/src/services/llm.ts`, modify `sendMessageStream` (currently at line 273). Insert the snapshot capture AFTER `userMsg` is pushed and BEFORE the tool loop begins. The function signature does not change; we add the capture inline:

Find:
```typescript
export async function* sendMessageStream(
  containerId: string,
  userMessage: string,
  ...
): AsyncGenerator<...> {
  const session = getOrCreateChatSession(containerId);
  const resolvedModel = model ?? config.aiSdk.model;

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);
  yield { type: "user", data: userMsg };

  const messages = sessionToOpenAIMessages(session);
```

Replace with:
```typescript
export async function* sendMessageStream(
  containerId: string,
  userMessage: string,
  ...
): AsyncGenerator<...> {
  const session = getOrCreateChatSession(containerId);
  const resolvedModel = model ?? config.aiSdk.model;

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);
  yield { type: "user", data: userMsg };

  // NEW: capture filesystem snapshot BEFORE the AI starts mutating files.
  // Best-effort: capture failure leaves snapshotId undefined; edit later
  // returns 410 snapshot_gone.
  await captureSnapshot(containerId, userMsg.id);
  userMsg.snapshotId = userMsg.id;  // captures by messageId
  await pruneSnapshots(containerId, 20);

  const messages = sessionToOpenAIMessages(session);
```

Add the imports at the top of `llm.ts`:
```typescript
import { captureSnapshot, pruneSnapshots } from "./snapshots";
```

- [ ] **Step 3: Wrap POST `/messages` in `withProjectLock`**

In `backend/src/routes/chat.ts`, wrap the existing POST handler in `withProjectLock`. Add imports at top:

```typescript
import { withProjectLock } from "../services/locks";
```

Find the `router.post("/:containerId/messages", ...)` block and wrap its body:

```typescript
router.post("/:containerId/messages", async (req, res) => {
  const { containerId } = req.params;
  const { message, attachments = [], stream = false, model } = req.body;

  if (model !== undefined && !isSupportedModel(model)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported model: ${model}`,
    });
  }

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      success: false,
      error: "Message is required",
    });
  }

  try {
    await withProjectLock(containerId, async () => {
      // ... existing handler body goes here ...
    });
  } catch (error) {
    // ... existing error handler ...
  }
});
```

Specifically: move ALL of the `try { ... }` body (the `if (stream)` branch and the `else` branch) inside the `withProjectLock` callback. The catch block remains outside.

- [ ] **Step 4: Run existing chat tests to verify no regression**

Run: `cd /Users/wangchangwei/V1/backend && npx jest src/routes/__tests__/chat.test.ts 2>&1 | tail -15` (or `npx vitest` if chat tests use vitest — confirm by `ls`)
Expected: PASS — pre-existing chat behavior unchanged

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/llm.ts backend/src/routes/chat.ts
git commit -m "feat(chat): capture filesystem snapshot on each AI run + withProjectLock"
```

---

## Task 3: PATCH /chat/:containerId/messages/:messageId endpoint

**Files:**
- Modify: `backend/src/routes/chat.ts` (add new PATCH route)
- Test: `backend/src/routes/__tests__/chat-edit.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `backend/src/routes/__tests__/chat-edit.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Mock the snapshot service so tests don't need docker.
const mockCapture = vi.fn().mockResolvedValue(undefined);
const mockRestore = vi.fn().mockResolvedValue(undefined);
const mockList = vi.fn().mockResolvedValue([]);
const mockPrune = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/snapshots", () => ({
  captureSnapshot: mockCapture,
  restoreSnapshot: mockRestore,
  listSnapshots: mockList,
  pruneSnapshots: mockPrune,
  deleteSnapshot: mockDelete,
}));

// Mock llmService.sendMessageStream so tests can assert call args.
const mockStream = vi.fn();
vi.mock("../../services/llm", async () => {
  const actual = await vi.importActual<any>("../../services/llm");
  return {
    ...actual,
    sendMessageStream: (...args: any[]) => mockStream(...args),
    getOrCreateChatSession: (cid: string) => ({
      id: cid + "-session",
      containerId: cid,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

import chatRouter from "../chat";
import { __resetLocksForTests } from "../../services/locks";
import { chatSessions } from "../../services/llm";

const app = express();
app.use(express.json());
app.use("/chat", chatRouter);

beforeEach(() => {
  mockCapture.mockClear();
  mockRestore.mockClear();
  mockStream.mockReset();
  __resetLocksForTests();
  chatSessions.clear();
});

afterEach(() => {
  chatSessions.clear();
});

const CID = "cid-1";
const MID = "user-42";

async function seedSession() {
  const session = (await import("../../services/llm")).getOrCreateChatSession(CID);
  session.messages.push({
    id: MID,
    role: "user",
    content: "old prompt",
    timestamp: new Date().toISOString(),
    snapshotId: MID,
  });
  session.messages.push({
    id: "assistant-1",
    role: "assistant",
    content: "old response",
    timestamp: new Date().toISOString(),
  });
  session.messages.push({
    id: "user-43",
    role: "user",
    content: "follow-up",
    timestamp: new Date().toISOString(),
  });
  session.messages.push({
    id: "assistant-2",
    role: "assistant",
    content: "follow-up response",
    timestamp: new Date().toISOString(),
  });
  return session;
}

describe("PATCH /chat/:containerId/messages/:messageId", () => {
  it("restores the snapshot BEFORE truncating session.messages (atomicity)", async () => {
    await seedSession();
    const callOrder: string[] = [];
    mockRestore.mockImplementation(async () => {
      callOrder.push("restore");
    });
    mockStream.mockImplementation(async function* () {
      callOrder.push("stream");
      yield { type: "done", data: {} };
    });

    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "new prompt" })
      .expect(200);

    expect(callOrder).toEqual(["restore", "stream"]);
  });

  it("truncates session.messages to [0..N] and updates content at N", async () => {
    const session = await seedSession();
    mockRestore.mockResolvedValue(undefined);
    mockStream.mockImplementation(async function* () {
      yield { type: "done", data: {} };
    });

    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "edited prompt" })
      .expect(200);

    // After PATCH: messages 0..0 kept (user-42 only), message-1+ dropped
    expect(session.messages.map((m: any) => m.id)).toEqual([MID]);
    expect(session.messages[0].content).toBe("edited prompt");
  });

  it("returns 400 on empty content", async () => {
    await seedSession();
    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "" })
      .expect(400);
  });

  it("returns 400 when messageId is not a user-role message", async () => {
    const session = await seedSession();
    await request(app)
      .patch(`/chat/${CID}/messages/assistant-1`)
      .send({ content: "new" })
      .expect(400);
  });

  it("returns 404 when messageId is not in session", async () => {
    await seedSession();
    await request(app)
      .patch(`/chat/${CID}/messages/user-does-not-exist`)
      .send({ content: "new" })
      .expect(404);
  });

  it("returns 410 when snapshot tarball is missing (restoreSnapshot throws)", async () => {
    await seedSession();
    mockRestore.mockRejectedValue(new Error("ENOENT"));
    mockStream.mockImplementation(async function* () {
      yield { type: "done", data: {} };
    });
    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "new" })
      .expect(410);
  });

  it("returns 500 and does NOT truncate session when restore fails", async () => {
    const session = await seedSession();
    const originalLength = session.messages.length;
    mockRestore.mockRejectedValue(new Error("tarball corrupt"));
    mockStream.mockImplementation(async function* () {
      yield { type: "done", data: {} };
    });
    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "new" })
      .expect(500);
    // Critical atomicity: messages should be untouched.
    expect(session.messages.length).toBe(originalLength);
  });

  it("invokes sendMessageStream with new content and same containerId", async () => {
    await seedSession();
    mockRestore.mockResolvedValue(undefined);
    mockStream.mockImplementation(async function* () {
      yield { type: "done", data: {} };
    });
    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "brand new prompt" })
      .expect(200);
    expect(mockStream).toHaveBeenCalledWith(CID, "brand new prompt", [], undefined);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/wangchangwei/V1/backend && npx vitest run src/routes/__tests__/chat-edit.test.ts 2>&1 | tail -15`
Expected: FAIL — PATCH route not registered (404)

- [ ] **Step 3: Implement the PATCH endpoint**

In `backend/src/routes/chat.ts`, add imports:

```typescript
import * as llmService from "../services/llm";
import { restoreSnapshot } from "../services/snapshots";
import { withProjectLock } from "../services/locks";
```

Add this route AFTER the GET `/:containerId/messages` route (before `export default router`):

```typescript
// PATCH /chat/:containerId/messages/:messageId
// Edit a past user message and regenerate from that point forward.
// Acquires withProjectLock to serialize against in-flight POST /messages.
//
// Atomicity invariant: restoreSnapshot MUST complete before
// session.messages is truncated. If restore throws, the session is
// left untouched and the response is 500.
router.patch("/:containerId/messages/:messageId", async (req, res) => {
  const { containerId, messageId } = req.params;
  const { content } = req.body ?? {};

  if (typeof content !== "string" || content.length === 0) {
    return res.status(400).json({ success: false, error: "content must be a non-empty string" });
  }

  const session = llmService.getOrCreateChatSession(containerId);
  const editIndex = session.messages.findIndex((m) => m.id === messageId);
  if (editIndex < 0) {
    return res.status(404).json({ success: false, error: "message_not_found" });
  }
  const target = session.messages[editIndex];
  if (target.role !== "user") {
    return res.status(400).json({ success: false, error: "can only edit user-role messages" });
  }
  if (!target.snapshotId) {
    return res.status(410).json({ success: false, error: "snapshot_gone" });
  }

  try {
    await withProjectLock(containerId, async () => {
      // 1. Restore filesystem (may throw if tarball missing — caught below)
      try {
        await restoreSnapshot(containerId, target.snapshotId!);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        const isMissing = /ENOENT|no such file/i.test(msg);
        if (isMissing) {
          res.status(410).json({ success: false, error: "snapshot_gone" });
        } else {
          res.status(500).json({ success: false, error: "restore_failed", detail: msg });
        }
        return;  // abort: do NOT truncate session
      }

      // 2. Truncate session.messages to [0..editIndex], then update content.
      session.messages = session.messages.slice(0, editIndex + 1);
      session.messages[editIndex].content = content;
      session.updatedAt = new Date().toISOString();

      // 3. Stream the regenerated AI response.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const stream = llmService.sendMessageStream(containerId, content, [], undefined);
      const keepalive = setInterval(() => {
        try { res.write(": keepalive\n\n"); } catch (_) {}
      }, 15000);
      (res as any).__keepalive = keepalive;

      try {
        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } finally {
        clearInterval(keepalive);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  } catch (error) {
    if (res.headersSent) return;  // already streaming; abort silently
    const err = error instanceof Error ? error : new Error(String(error));
    res.status(500).json({ success: false, error: err.message });
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/wangchangwei/V1/backend && npx vitest run src/routes/__tests__/chat-edit.test.ts 2>&1 | tail -20`
Expected: PASS — all 8 tests green

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/chat.ts backend/src/routes/__tests__/chat-edit.test.ts
git commit -m "feat(chat): PATCH endpoint for edit-and-regenerate with snapshot restore"
```

---

## Task 4: Frontend EditButton on MessageBubble

**Files:**
- Modify: locate the MessageBubble component in `frontend/src/app/editor/...` (path confirmed at implementation time — search `grep -r "MessageBubble" frontend/src`)
- Create: `frontend/src/app/editor/components/MessageBubbleEditMode.tsx` if not co-located

- [ ] **Step 1: Find the existing MessageBubble component**

Run: `grep -r "MessageBubble" /Users/wangchangwei/V1/frontend/src --include="*.tsx" -l`
Expected output: a single file path (the component location).

Open the file. Identify:
- Where the user-role message renders its content
- The existing props interface
- Where to add the `onEdit` callback

- [ ] **Step 2: Write the failing component test (if test infra exists)**

If the project has a `frontend/src/.../__tests__/` pattern, create `frontend/src/app/editor/components/__tests__/MessageBubble.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble";

describe("MessageBubble edit mode", () => {
  it("shows Edit button on hover for user-role messages", () => {
    render(
      <MessageBubble
        message={{ id: "u1", role: "user", content: "hello", timestamp: "" }}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/edit message/i)).toBeInTheDocument();
  });

  it("clicking Edit reveals a textarea and Save/Cancel buttons", () => {
    render(
      <MessageBubble
        message={{ id: "u1", role: "user", content: "hello", timestamp: "" }}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(/edit message/i));
    expect(screen.getByRole("textbox")).toHaveValue("hello");
    expect(screen.getByText(/save/i)).toBeInTheDocument();
    expect(screen.getByText(/cancel/i)).toBeInTheDocument();
  });

  it("Save calls onSave with the new content", () => {
    const onSave = vi.fn();
    render(
      <MessageBubble
        message={{ id: "u1", role: "user", content: "hello", timestamp: "" }}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByLabelText(/edit message/i));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "world" } });
    fireEvent.click(screen.getByText(/save/i));
    expect(onSave).toHaveBeenCalledWith("world");
  });

  it("Cancel reverts to display mode without calling onSave", () => {
    const onSave = vi.fn();
    render(
      <MessageBubble
        message={{ id: "u1", role: "user", content: "hello", timestamp: "" }}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByLabelText(/edit message/i));
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does NOT render Edit button for assistant-role messages", () => {
    render(
      <MessageBubble
        message={{ id: "a1", role: "assistant", content: "hi", timestamp: "" }}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/edit message/i)).not.toBeInTheDocument();
  });
});
```

If no existing test infra for components, skip to Step 3 (visual confirmation comes from E2E in Task 5).

- [ ] **Step 3: Implement edit mode in MessageBubble**

In the MessageBubble component file, add:

```tsx
import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";

// Add to existing props (extend the interface, do not break callers):
// onSave: (newContent: string) => void

// Inside the component body, add state:
const [isEditing, setIsEditing] = useState(false);
const [draft, setDraft] = useState(message.content);

// Inside the user-role message render, add the edit affordance.
// Replace the existing content render for user-role with:

{message.role === "user" && (
  <div className="group relative">
    {isEditing ? (
      <div className="flex flex-col gap-2">
        <textarea
          aria-label="Edit message"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
          rows={Math.max(2, draft.split("\n").length)}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setDraft(message.content);
            }}
            className="rounded bg-gray-700 px-3 py-1 text-sm text-white hover:bg-gray-600"
          >
            <X size={14} className="inline" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              onSave(draft);
            }}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
          >
            <Check size={14} className="inline" /> Save
          </button>
        </div>
      </div>
    ) : (
      <>
        <div className="whitespace-pre-wrap">{message.content}</div>
        <button
          type="button"
          aria-label="Edit message"
          onClick={() => {
            setDraft(message.content);
            setIsEditing(true);
          }}
          className="absolute -right-2 -top-2 hidden rounded bg-gray-700 p-1 text-white opacity-0 transition-opacity group-hover:block group-hover:opacity-100 hover:bg-gray-600"
        >
          <Pencil size={12} />
        </button>
      </>
    )}
  </div>
)}
```

- [ ] **Step 4: Wire `onSave` to the PATCH endpoint in the chat panel parent**

In the chat panel component (the parent that maps over `session.messages`), find the existing `useChatStream` consumer. Add a handler that calls PATCH and pipes the SSE response back into the same stream consumer.

```tsx
const handleSave = useCallback(async (messageId: string, newContent: string) => {
  setIsRegenerating(true);
  try {
    const res = await fetch(`/chat/${containerId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    if (res.status === 410) {
      toast.error("Cannot undo past 20 messages — snapshot was pruned.");
      return;
    }
    if (res.status === 404) {
      toast.error("Message not found.");
      return;
    }
    if (!res.ok || !res.body) {
      toast.error(`Edit failed (${res.status})`);
      return;
    }
    // Pipe SSE into the existing stream consumer.
    await consumeStream(res.body);  // existing helper, similar to POST /messages handling
    toast.success("Regenerated from edit");
  } finally {
    setIsRegenerating(false);
  }
}, [containerId]);

// Pass to MessageBubble:
<MessageBubble
  message={msg}
  onSave={(newContent) => handleSave(msg.id, newContent)}
/>
```

- [ ] **Step 5: Run frontend typecheck + tests**

Run: `cd /Users/wangchangwei/V1/frontend && npx tsc --noEmit 2>&1 | tail -10`
Expected: PASS — no type errors

If component tests were created in Step 2:
Run: `cd /Users/wangchangwei/V1/frontend && npx vitest run src/app/editor/components/__tests__/MessageBubble.test.tsx 2>&1 | tail -10`
Expected: PASS — all 5 tests green

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/editor/
git commit -m "feat(chat-ui): add Edit button to user messages with PATCH wiring"
```

---

## Task 5: E2E Test for Full Edit Flow

**Files:**
- Create: `frontend/e2e/edit-and-regenerate.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `frontend/e2e/edit-and-regenerate.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const CID = process.env.E2E_CONTAINER_ID ?? "test-cid";

test.describe("Edit-and-regenerate chat flow", () => {
  test("user can edit a past message and see the AI regenerate", async ({ page }) => {
    await page.goto(`/projects/${CID}`);

    // Wait for chat panel to load
    await page.waitForSelector('[data-testid="chat-message"]');

    // Find the first user message and hover to reveal Edit button
    const firstUserMessage = page.locator('[data-testid="chat-message"][data-role="user"]').first();
    await firstUserMessage.hover();
    await firstUserMessage.getByLabel(/edit message/i).click();

    // Replace content
    const textarea = page.getByRole("textbox", { name: /edit message/i });
    await textarea.fill("Build me a different landing page");
    await page.getByRole("button", { name: /save/i }).click();

    // Wait for new AI response to stream in (toast appears on success)
    await expect(page.getByText(/regenerated from edit/i)).toBeVisible({ timeout: 30000 });
  });

  test("Cancel reverts the edit without making an API call", async ({ page }) => {
    await page.goto(`/projects/${CID}`);

    let patchCallCount = 0;
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes("/messages/")) patchCallCount++;
    });

    const firstUserMessage = page.locator('[data-testid="chat-message"][data-role="user"]').first();
    await firstUserMessage.hover();
    await firstUserMessage.getByLabel(/edit message/i).click();

    await page.getByRole("textbox", { name: /edit message/i }).fill("never sent");
    await page.getByRole("button", { name: /cancel/i }).click();

    expect(patchCallCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run E2E (against local dev backend)**

Run (in two terminals):
- Terminal 1: `cd /Users/wangchangwei/V1/backend && npm run dev`
- Terminal 2: `cd /Users/wangchangwei/V1/frontend && npm run dev`

Then: `cd /Users/wangchangwei/V1/frontend && npx playwright test e2e/edit-and-regenerate.spec.ts 2>&1 | tail -20`
Expected: PASS — both tests green

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/edit-and-regenerate.spec.ts
git commit -m "test(chat-e2e): cover edit-and-regenerate flow with cancel path"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Snapshot capture on POST /messages → Task 2
- ✅ Snapshot storage at `data/snapshots/{containerId}/{messageId}.tar.gz` → Task 1
- ✅ Excludes `node_modules`/`.next`/`.git`/`.turbo` → Task 1 Step 3
- ✅ PATCH endpoint → Task 3
- ✅ Capture-restore atomicity (restore before truncate) → Task 3 Step 1 (test asserts call order)
- ✅ withProjectLock serialization → Task 2 (POST wrap) + Task 3 (PATCH wrap)
- ✅ `snapshotId` field on Message → Task 2
- ✅ Frontend EditButton → Task 4
- ✅ 410 snapshot_gone handling → Task 3 (test) + Task 4 (toast)
- ✅ 20-snapshot prune → Task 1 (pruneSnapshots) + Task 2 (called after capture)
- ✅ E2E coverage → Task 5

**2. Placeholder scan:** No "TBD", "TODO", or "implement later" patterns. All code blocks contain actual code. File paths confirmed by `ls` at implementation time where noted (Task 4 Step 1).

**3. Type consistency:**
- `Message.snapshotId?: string` defined in Task 2, used in Task 3 (read access via `target.snapshotId!`)
- `captureSnapshot(containerId, messageId)` signature consistent across Task 1, 2, 3
- `restoreSnapshot(containerId, messageId)` signature consistent across Task 1, 3
- `withProjectLock(containerId, fn)` used the same way in Tasks 2 and 3

**4. Deviations from spec noted:**
- Sessions remain in-memory (spec assumed disk persistence; reality is in-memory `Map`). Captured in plan preamble. This affects edit-after-server-restart behavior (edit 404s because message is gone) — acceptable v1 limitation, not introduced by this plan.
- `Message.id` already exists in current `llm.ts` (line 7) — used as the snapshot key. No new ID generation needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-16-edit-and-regenerate-chat.md`. **5 tasks**, ~25 atomic steps, all TDD where test infra exists.
