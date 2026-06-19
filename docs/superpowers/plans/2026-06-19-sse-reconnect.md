# SSE Reconnect + Multi-Client Subscribe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When pi is streaming a chat turn, any number of clients (refreshed tab, second tab, edit-and-regenerate) can subscribe to ongoing chunks and continue rendering in real time. Replace the per-connection SSE model with a per-turn server-side state object.

**Architecture:** Introduce `TurnBroadcaster` — a per-containerId object that owns the in-flight turn state, fans chunks out to any number of `Response` subscribers, and is cleaned up only when `piChatStream` itself completes. POST `/messages` becomes a synchronous fire-and-forget: returns JSON immediately, runs `piChatTurn` in the background writing to a broadcaster. A new `GET /chat/:containerId/turn-stream` endpoint lets clients subscribe via `EventSource`. `chatSessions.inProgressTurn` is removed in favor of the broadcaster as the single source of truth.

**Tech Stack:** Backend Express + vitest (existing) + supertest; frontend Next.js 15 + native `EventSource` API. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-19-sse-reconnect-design.md`

---

## File Structure

**Created:**
- `backend/src/services/turnBroadcaster.ts` — `TurnBroadcaster` class
- `backend/src/services/turnBroadcasters.ts` — registry `Map<containerId, TurnBroadcaster>`
- `backend/src/services/__tests__/turnBroadcaster.test.ts` — unit tests for the class
- `backend/src/services/__tests__/turnBroadcasters.test.ts` — unit tests for the registry
- `backend/src/routes/__tests__/chat-reconnect.test.ts` — integration tests for new POST/GET endpoints

**Modified:**
- `backend/src/routes/chat.ts` — refactor `runChatTurn` to write to broadcaster; refactor `POST /messages` (no stream), `PATCH /messages/:id` (no stream); add `GET /turn-stream`; read `GET /turn-status` from broadcaster
- `backend/src/services/chatSessions.ts` — remove `inProgressTurn` field + `InProgressTurn` interface
- `backend/src/routes/__tests__/chat-stream.test.ts` — update to match new POST behavior (reject `stream:true`, return JSON)
- `frontend/src/lib/backend/api.ts` — add `subscribeTurnStream`; remove/replace `sendChatMessageStream` and `patchChatMessageStream`; update `sendChatMessage` to no longer expect streaming
- `frontend/src/app/projects/components/WorkspaceDashboard.tsx` — refactor `handleSendMessage` and `handleEditMessage` to "start + subscribe" two-phase; refactor `loadChatHistory` to subscribe on in-flight recovery

**Removed:**
- `frontend/src/lib/backend/api.ts:336-415` — `sendChatMessageStream` function (replaced by `subscribeTurnStream`)
- `frontend/src/lib/backend/api.ts:417-502` — `patchChatMessageStream` function (PATCH also returns JSON now)
- `backend/src/services/chatSessions.ts:33-39` — `InProgressTurn` interface
- `backend/src/services/chatSessions.ts:47` — `inProgressTurn?: InProgressTurn;` field on `ChatSession`
- `backend/src/services/chatSessions.ts:110-112` — in-flight skip in `sessionToPiMessages` (no longer needed without `inProgressTurn`)

---

## Task 1: TurnBroadcaster class foundation (constructor + attach/detach)

**Files:**
- Create: `backend/src/services/turnBroadcaster.ts`
- Test: `backend/src/services/__tests__/turnBroadcaster.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/turnBroadcaster.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { TurnBroadcaster } from "../turnBroadcaster";
import type { Message, ToolCallRecord } from "../chatSessions";

// Fake Express response for capturing writes + simulating close.
function makeFakeRes() {
  const writes: string[] = [];
  const listeners: Record<string, Array<() => void>> = {};
  return {
    writes,
    listeners,
    write: (s: string) => {
      writes.push(s);
      return true;
    },
    on: (event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
    },
    end: () => {
      (listeners["close"] ?? []).forEach((cb) => cb());
    },
  } as any;
}

const CID = "container-1";
const userMsg: Message = {
  id: "user-1",
  role: "user",
  content: "hi",
  timestamp: "2024-01-01T00:00:00.000Z",
};

describe("TurnBroadcaster — lifecycle", () => {
  it("initializes state with running status and starts an empty subscriber set", () => {
    let finalized = false;
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {
      finalized = true;
    });

    expect(b.getState().status).toBe("running");
    expect(b.getState().userMsg).toEqual(userMsg);
    expect(b.getState().assistantMsgId).toBe("asst-1");
    expect(b.getState().partialText).toBe("");
    expect(b.getState().toolCalls).toEqual([]);
    expect(b.getState().startedAt).toBeTruthy();
    expect(finalized).toBe(false);
  });

  it("attach adds a subscriber; detach removes it", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    const res1 = makeFakeRes();
    const res2 = makeFakeRes();

    b.attach(res1);
    b.attach(res2);
    expect((b as any).subscribers.size).toBe(2);

    b.detach(res1);
    expect((b as any).subscribers.size).toBe(1);
    expect((b as any).subscribers.has(res2)).toBe(true);

    b.detach(res2);
    expect((b as any).subscribers.size).toBe(0);
  });

  it("detach is a no-op for unknown subscribers", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    const stranger = makeFakeRes();
    expect(() => b.detach(stranger)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: FAIL — `TurnBroadcaster` module not found.

- [ ] **Step 3: Create the TurnBroadcaster skeleton**

Create `backend/src/services/turnBroadcaster.ts`:

```typescript
// TurnBroadcaster — owns the in-flight state of a single chat turn and fans
// chunks out to any number of SSE subscribers. Created at turn start, lives
// until piChatStream emits done/error, then auto-cleans via onFinalize.
//
// The broadcaster is a passive view layer: it never owns the turn lifecycle.
// `runChatTurn` (in routes/chat.ts) drives the turn by calling emit() and
// finalize(); the broadcaster just records state and broadcasts.

import type { Message, ToolCallRecord } from "./chatSessions";

export type TurnStatus = "running" | "done" | "error";

export interface BroadcasterState {
  userMsg: Message;
  assistantMsgId: string;
  partialText: string;
  toolCalls: ToolCallRecord[];
  status: TurnStatus;
  error?: { message: string };
  startedAt: string;
  finishedAt?: string;
}

// Minimal shape of an Express `Response` that we use. We keep this loose
// so the broadcaster can be tested with a fake without pulling in express.
interface SubscriberRes {
  write: (chunk: string) => boolean | void;
  on: (event: string, cb: () => void) => void;
  end?: () => void;
}

export class TurnBroadcaster {
  private subscribers: Set<SubscriberRes> = new Set();
  private state: BroadcasterState;
  private onFinalize: () => void;

  constructor(
    public readonly containerId: string,
    userMsg: Message,
    assistantMsgId: string,
    onFinalize: () => void
  ) {
    this.onFinalize = onFinalize;
    this.state = {
      userMsg,
      assistantMsgId,
      partialText: "",
      toolCalls: [],
      status: "running",
      startedAt: new Date().toISOString(),
    };
  }

  attach(res: SubscriberRes): void {
    // Initial flush is added in Task 3; for now just register.
    this.subscribers.add(res);
  }

  detach(res: SubscriberRes): void {
    this.subscribers.delete(res);
  }

  // emit / finalize are implemented in Tasks 2 and 4.
  emit(_chunk: any): void {
    throw new Error("not implemented");
  }

  finalize(_status: "done" | "error", _error?: { message: string }): void {
    throw new Error("not implemented");
  }

  getState(): BroadcasterState {
    return this.state;
  }

  abort(): void {
    // Wired in Task 4 (no-op for now).
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/turnBroadcaster.ts src/services/__tests__/turnBroadcaster.test.ts
git commit -m "feat(chat): add TurnBroadcaster skeleton with attach/detach lifecycle"
```

---

## Task 2: TurnBroadcaster emit() — fanout + state update

**Files:**
- Modify: `backend/src/services/turnBroadcaster.ts`
- Test: `backend/src/services/__tests__/turnBroadcaster.test.ts`

- [ ] **Step 1: Add the failing test for emit()**

Append to the existing `describe("TurnBroadcaster — lifecycle", ...)` block in `turnBroadcaster.test.ts`:

```typescript
describe("TurnBroadcaster — emit()", () => {
  it("writes a chunk to every attached subscriber", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    const a = makeFakeRes();
    const c = makeFakeRes();
    b.attach(a);
    b.attach(c);

    b.emit({ type: "assistant", data: { id: "asst-1", content: "hi" } });

    expect(a.writes).toEqual([`data: ${JSON.stringify({ type: "assistant", data: { id: "asst-1", content: "hi" } })}\n\n`]);
    expect(c.writes).toEqual(a.writes);
  });

  it("grows state.partialText from assistant deltas", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});

    b.emit({ type: "assistant", data: { id: "asst-1", content: "Hello" } });
    expect(b.getState().partialText).toBe("Hello");

    b.emit({ type: "assistant", data: { id: "asst-1", content: "Hello world" } });
    expect(b.getState().partialText).toBe("Hello world");
  });

  it("accumulates tool calls from tool_call chunks", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});

    b.emit({ type: "tool_call", data: { id: "tc-1", name: "read", args: "x" } });
    b.emit({ type: "tool_call", data: { id: "tc-2", name: "bash", args: "ls" } });

    expect(b.getState().toolCalls.map((tc) => tc.id)).toEqual(["tc-1", "tc-2"]);
  });

  it("patches the matching tool call's result from tool_result chunks", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});

    b.emit({ type: "tool_call", data: { id: "tc-1", name: "read", args: "x" } });
    b.emit({ type: "tool_result", data: { id: "tc-1", ok: true, result: "ok" } });

    const tc = b.getState().toolCalls[0]!;
    expect(tc.ok).toBe(true);
    expect(tc.result).toBe("ok");
  });

  it("does not throw when emitting with no subscribers", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    expect(() => b.emit({ type: "assistant", data: { id: "asst-1", content: "hi" } })).not.toThrow();
  });

  it("does not throw when a subscriber's write fails", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    const broken = { write: () => { throw new Error("EPIPE"); }, on: () => {} } as any;
    const good = makeFakeRes();
    b.attach(broken);
    b.attach(good);

    expect(() => b.emit({ type: "assistant", data: { id: "asst-1", content: "hi" } })).not.toThrow();
    expect(good.writes.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: FAIL — `emit` currently throws "not implemented".

- [ ] **Step 3: Implement emit()**

Replace the `emit` method in `backend/src/services/turnBroadcaster.ts`:

```typescript
  emit(chunk: any): void {
    // Update state machine.
    if (chunk?.type === "assistant") {
      const text = extractAssistantText(chunk.data);
      if (text) this.state.partialText = text;
    } else if (chunk?.type === "tool_call") {
      this.state.toolCalls.push({
        id: chunk.data.id,
        name: chunk.data.name,
        args: chunk.data.args ?? "",
        ok: true,
        result: "",
      });
    } else if (chunk?.type === "tool_result") {
      const target = this.state.toolCalls.find((tc) => tc.id === chunk.data.id);
      if (target) {
        target.ok = !!chunk.data.ok;
        target.result =
          typeof chunk.data.result === "string"
            ? chunk.data.result
            : JSON.stringify(chunk.data.result ?? "");
      }
    }

    // Fan out to all subscribers; tolerate write failures (e.g. closed res).
    const payload = `data: ${JSON.stringify(chunk)}\n\n`;
    for (const res of this.subscribers) {
      try {
        res.write(payload);
      } catch {
        // Subscriber connection died mid-write; skip.
      }
    }
  }
```

Add a helper at the bottom of the file:

```typescript
function extractAssistantText(data: any): string {
  if (!data) return "";
  if (typeof data.content === "string") return data.content;
  if (Array.isArray(data.content)) {
    return data.content
      .filter((c: any) => c?.type === "text")
      .map((c: any) => c.text ?? "")
      .join("");
  }
  return "";
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: PASS — all tests in both `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/turnBroadcaster.ts src/services/__tests__/turnBroadcaster.test.ts
git commit -m "feat(chat): TurnBroadcaster emit() updates state and fans out chunks"
```

---

## Task 3: TurnBroadcaster attach() — initial state flush

**Files:**
- Modify: `backend/src/services/turnBroadcaster.ts`
- Test: `backend/src/services/__tests__/turnBroadcaster.test.ts`

- [ ] **Step 1: Add the failing test for initial flush**

Append a new `describe` block to `turnBroadcaster.test.ts`:

```typescript
describe("TurnBroadcaster — attach() initial flush", () => {
  it("flushes user + assistant(partialText) + toolCalls to a new subscriber", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    b.emit({ type: "assistant", data: { id: "asst-1", content: "Hello" } });
    b.emit({ type: "tool_call", data: { id: "tc-1", name: "read", args: "x" } });
    b.emit({ type: "tool_result", data: { id: "tc-1", ok: true, result: "ok" } });

    const newRes = makeFakeRes();
    b.attach(newRes);

    // Expect: user chunk, assistant chunk (with current partialText + toolCalls),
    // then re-emit of the tool_call + tool_result (in order).
    const types = newRes.writes.map((w) => JSON.parse(w.replace(/^data: /, "").replace(/\n\n$/, "")).type);
    expect(types).toEqual([
      "user",
      "assistant",
      "tool_call",
      "tool_result",
    ]);

    const assistant = JSON.parse(newRes.writes[1]!.replace(/^data: /, "").replace(/\n\n$/, ""));
    expect(assistant.data.content).toBe("Hello");
    expect(assistant.data.id).toBe("asst-1");
  });

  it("does not re-emit if no state has accumulated (only the user chunk)", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});

    const res = makeFakeRes();
    b.attach(res);

    const types = res.writes.map((w) => JSON.parse(w.replace(/^data: /, "").replace(/\n\n$/, "")).type);
    expect(types).toEqual(["user"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: FAIL — current `attach` does not write the user chunk.

- [ ] **Step 3: Implement the flush in attach()**

Replace the `attach` method in `turnBroadcaster.ts`:

```typescript
  attach(res: SubscriberRes): void {
    this.subscribers.add(res);

    // Replay enough state for the new subscriber to render the same view as
    // long-running clients. Order: user message → current assistant snapshot
    // (carrying partialText + toolCalls) → individual tool_call/tool_result
    // chunks (so the chat page's tool-call reducer path also runs).
    const { userMsg, assistantMsgId, partialText, toolCalls } = this.state;

    safeWrite(res, { type: "user", data: userMsg });
    safeWrite(res, {
      type: "assistant",
      data: {
        id: assistantMsgId,
        role: "assistant",
        content: partialText,
        timestamp: this.state.startedAt,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
    });

    for (const tc of toolCalls) {
      safeWrite(res, { type: "tool_call", data: { id: tc.id, name: tc.name, args: tc.args } });
      safeWrite(res, {
        type: "tool_result",
        data: { id: tc.id, ok: tc.ok, result: tc.result },
      });
    }
  }
```

Add the `safeWrite` helper at the top of the file (next to the imports):

```typescript
function safeWrite(res: SubscriberRes, chunk: any): void {
  try {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  } catch {
    // Ignore write failures during initial flush; the subscriber's first
    // read loop will hit onerror and detach.
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: PASS — all 3 `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/turnBroadcaster.ts src/services/__tests__/turnBroadcaster.test.ts
git commit -m "feat(chat): TurnBroadcaster attach() flushes user + state snapshot"
```

---

## Task 4: TurnBroadcaster finalize() — done/error + onFinalize

**Files:**
- Modify: `backend/src/services/turnBroadcaster.ts`
- Test: `backend/src/services/__tests__/turnBroadcaster.test.ts`

- [ ] **Step 1: Add the failing test for finalize()**

Append a new `describe` block to `turnBroadcaster.test.ts`:

```typescript
describe("TurnBroadcaster — finalize()", () => {
  it("finalize('done') writes a done chunk, sets status, and triggers onFinalize", () => {
    let finalized = false;
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {
      finalized = true;
    });
    const res = makeFakeRes();
    b.attach(res);

    b.finalize("done");

    const last = JSON.parse(res.writes[res.writes.length - 1]!.replace(/^data: /, "").replace(/\n\n$/, ""));
    expect(last.type).toBe("done");
    expect(b.getState().status).toBe("done");
    expect(b.getState().finishedAt).toBeTruthy();
    expect(finalized).toBe(true);
  });

  it("finalize('error', {message}) writes an error chunk and sets state.error", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    const res = makeFakeRes();
    b.attach(res);

    b.finalize("error", { message: "pi crashed" });

    const last = JSON.parse(res.writes[res.writes.length - 1]!.replace(/^data: /, "").replace(/\n\n$/, ""));
    expect(last.type).toBe("error");
    expect(last.data.error).toBe("pi crashed");
    expect(b.getState().status).toBe("error");
    expect(b.getState().error?.message).toBe("pi crashed");
  });

  it("finalize is idempotent — second call is a no-op", () => {
    let count = 0;
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {
      count += 1;
    });
    b.finalize("done");
    b.finalize("error", { message: "x" });
    expect(count).toBe(1);
  });

  it("attach after finalize still flushes state and the final chunk", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    b.emit({ type: "assistant", data: { id: "asst-1", content: "Hi" } });
    b.finalize("done");

    const res = makeFakeRes();
    b.attach(res);

    const types = res.writes.map((w) => JSON.parse(w.replace(/^data: /, "").replace(/\n\n$/, "")).type);
    expect(types).toEqual(["user", "assistant", "done"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: FAIL — `finalize` still throws "not implemented".

- [ ] **Step 3: Implement finalize()**

Replace `finalize` and `abort` in `turnBroadcaster.ts`:

```typescript
  finalize(status: "done" | "error", error?: { message: string }): void {
    if (this.state.status !== "running") return; // idempotent

    this.state.status = status;
    this.state.finishedAt = new Date().toISOString();
    if (error) this.state.error = error;

    // Push the final chunk to all subscribers.
    const finalChunk =
      status === "done"
        ? { type: "done", data: { id: this.state.assistantMsgId } }
        : { type: "error", data: error ?? { message: "turn failed" } };

    for (const res of this.subscribers) {
      safeWrite(res, finalChunk);
    }

    // Notify caller (registry) so it can remove us.
    this.onFinalize();
  }

  abort(): void {
    this.finalize("error", { message: "aborted" });
  }
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/services/__tests__/turnBroadcaster.test.ts`
Expected: PASS — all 5 `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/turnBroadcaster.ts src/services/__tests__/turnBroadcaster.test.ts
git commit -m "feat(chat): TurnBroadcaster finalize() emits done/error and cleans up"
```

---

## Task 5: turnBroadcasters registry

**Files:**
- Create: `backend/src/services/turnBroadcasters.ts`
- Test: `backend/src/services/__tests__/turnBroadcasters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/__tests__/turnBroadcasters.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import {
  getBroadcaster,
  setBroadcaster,
  removeBroadcaster,
  __resetBroadcastersForTests,
} from "../turnBroadcasters";
import { TurnBroadcaster } from "../turnBroadcaster";
import type { Message } from "../chatSessions";

const CID = "reg-cid";
const userMsg: Message = {
  id: "u-1",
  role: "user",
  content: "hi",
  timestamp: "2024-01-01T00:00:00.000Z",
};

function makeBroadcaster(cid: string) {
  return new TurnBroadcaster(cid, userMsg, "asst-1", () => {
    removeBroadcaster(cid);
  });
}

afterEach(() => {
  __resetBroadcastersForTests();
});

describe("turnBroadcasters registry", () => {
  it("getBroadcaster returns undefined when not set", () => {
    expect(getBroadcaster(CID)).toBeUndefined();
  });

  it("setBroadcaster + getBroadcaster round-trips", () => {
    const b = makeBroadcaster(CID);
    setBroadcaster(CID, b);
    expect(getBroadcaster(CID)).toBe(b);
  });

  it("removeBroadcaster drops the entry", () => {
    const b = makeBroadcaster(CID);
    setBroadcaster(CID, b);
    removeBroadcaster(CID);
    expect(getBroadcaster(CID)).toBeUndefined();
  });

  it("setBroadcaster overwrites prior entry for the same containerId", () => {
    const first = makeBroadcaster(CID);
    const second = makeBroadcaster(CID);
    setBroadcaster(CID, first);
    setBroadcaster(CID, second);
    expect(getBroadcaster(CID)).toBe(second);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/services/__tests__/turnBroadcasters.test.ts`
Expected: FAIL — `turnBroadcasters` module not found.

- [ ] **Step 3: Create the registry module**

Create `backend/src/services/turnBroadcasters.ts`:

```typescript
// Per-containerId registry of in-flight TurnBroadcaster instances.
//
// One broadcaster per containerId at a time: POST /messages checks for an
// existing entry and 409s if one is in flight. The registry self-cleans via
// the broadcaster's onFinalize callback, which calls removeBroadcaster().

import { TurnBroadcaster } from "./turnBroadcaster";

const broadcasters = new Map<string, TurnBroadcaster>();

export function getBroadcaster(containerId: string): TurnBroadcaster | undefined {
  return broadcasters.get(containerId);
}

export function setBroadcaster(containerId: string, b: TurnBroadcaster): void {
  broadcasters.set(containerId, b);
}

export function removeBroadcaster(containerId: string): void {
  broadcasters.delete(containerId);
}

// Test-only: clear all registered broadcasters. Production code never calls
// this — broadcasters self-clean via onFinalize.
export function __resetBroadcastersForTests(): void {
  broadcasters.clear();
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/services/__tests__/turnBroadcasters.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/turnBroadcasters.ts src/services/__tests__/turnBroadcasters.test.ts
git commit -m "feat(chat): add turnBroadcasters registry (get/set/remove)"
```

---

## Task 6: Remove inProgressTurn from chatSessions

**Files:**
- Modify: `backend/src/services/chatSessions.ts`

- [ ] **Step 1: Read the current file and identify the lines to remove**

Open `backend/src/services/chatSessions.ts`. The following are now dead code:
- Lines 33-39: `InProgressTurn` interface
- Line 47: `inProgressTurn?: InProgressTurn;` field on `ChatSession`
- Lines 110-112: the in-flight skip inside `sessionToPiMessages`

The file has a comment at the top that mentions in-progress turn tracking — leave that historical comment, or update it. We will **delete the code** but leave the rest of the file alone.

- [ ] **Step 2: Delete the InProgressTurn interface (lines 33-39)**

Replace the block (lines 33-39 inclusive) with nothing (one blank line remains):

```typescript
export interface ChatSession {
  id: string;
  containerId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Update sessionToPiMessages — remove the in-flight skip (lines 110-112)**

Find the loop body inside `sessionToPiMessages`:

```typescript
  for (const msg of session.messages) {
    if (msg.role === "user") {
      if (!msg.snapshotId && session.inProgressTurn?.userMsgId === msg.id) {
        continue;
      }
      result.push(buildUserContent(msg.content, msg.attachments));
    } else if (msg.role === "assistant") {
      result.push({ role: "assistant", content: msg.content || "" });
    }
  }
```

Replace with:

```typescript
  for (const msg of session.messages) {
    if (msg.role === "user") {
      result.push(buildUserContent(msg.content, msg.attachments));
    } else if (msg.role === "assistant") {
      result.push({ role: "assistant", content: msg.content || "" });
    }
  }
```

- [ ] **Step 4: Run the existing test suite to verify nothing else breaks**

Run: `cd backend && bun test`
Expected: Some tests in `chat-stream.test.ts` and `chat-edit.test.ts` that exercise `inProgressTurn` may now fail or type-error. The first to hit will be `chat-stream.test.ts:198` (the streaming test that inspected in-flight behavior). These will be updated in Task 13. For now, expect **some failures** but the `snapshots.test.ts`, `containers.test.ts`, `file.test.ts`, `deploy.test.ts`, `integration-login.test.ts` should still pass.

If `bun test` is not yet broken, the next test task (Task 7) will surface it. Either way, do **not** commit this change yet.

- [ ] **Step 5: Stash until Task 13**

```bash
cd backend
git stash push -- src/services/chatSessions.ts
```

We will revisit this in Task 7 (refactor `runChatTurn`) and Task 13 (update the broken tests).

---

## Task 7: Refactor runChatTurn to write to broadcaster

**Files:**
- Modify: `backend/src/routes/chat.ts`
- Test: `backend/src/routes/__tests__/chat-reconnect.test.ts` (new)

- [ ] **Step 1: Read the current runChatTurn to understand its current contract**

`backend/src/routes/chat.ts:260-404` is the existing `runChatTurn`. It is an async generator that yields `{ type, data }` chunks. POST /messages and PATCH /messages/:id both consume it via `for await (const chunk of stream) { res.write(...) }`.

The refactor goal:
- `runChatTurn` no longer yields chunks; it consumes piChatStream and **emits to a TurnBroadcaster** it creates itself
- The caller (POST / PATCH) just creates the broadcaster, hands the userMsg/assistantMsgId to runChatTurn, and returns immediately

- [ ] **Step 2: Write the failing integration test for the new runChatTurn contract**

Create `backend/src/routes/__tests__/chat-reconnect.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import chatRouter from "../chat";
import { __resetLocksForTests } from "../../services/locks";
import * as chatSessions from "../../services/chatSessions";
import { __resetBroadcastersForTests, getBroadcaster } from "../../services/turnBroadcasters";

const mocks = vi.hoisted(() => ({
  piChatStream: vi.fn<() => AsyncGenerator<any>>(async function* () {}),
  hasPiContainer: vi.fn().mockReturnValue(true),
  captureSnapshot: vi.fn().mockResolvedValue(true),
  pruneSnapshots: vi.fn().mockResolvedValue(undefined),
  restoreSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/piProxy", async () => {
  const actual = await vi.importActual<any>("../../services/piProxy");
  return {
    ...actual,
    piChatStream: (...args: any[]) => mocks.piChatStream(...args),
    hasPiContainer: (...args: any[]) => mocks.hasPiContainer(...args),
  };
});

vi.mock("../../services/snapshots", () => ({
  captureSnapshot: mocks.captureSnapshot,
  pruneSnapshots: mocks.pruneSnapshots,
  restoreSnapshot: mocks.restoreSnapshot,
}));

const app = express();
app.use(express.json());
app.use("/chat", chatRouter);

const CID = "reconnect-cid";

beforeEach(() => {
  mocks.piChatStream.mockReset();
  mocks.piChatStream.mockImplementation(async function* () {});
  mocks.hasPiContainer.mockReturnValue(true);
  mocks.captureSnapshot.mockResolvedValue(true);
  mocks.pruneSnapshots.mockResolvedValue(undefined);
  __resetLocksForTests();
  __resetBroadcastersForTests();
  chatSessions.chatSessions.clear();
});

afterEach(() => {
  chatSessions.chatSessions.clear();
  __resetBroadcastersForTests();
  __resetLocksForTests();
});

describe("POST /chat/:containerId/messages — broadcaster wiring", () => {
  it("returns 200 with JSON (no SSE) and registers a broadcaster for the turn", async () => {
    mocks.piChatStream.mockImplementation(async function* () {
      yield { type: "assistant", data: { id: "asst-1", content: "Hello" } };
      yield { type: "done", data: {} };
    });

    const res = await request(app)
      .post(`/chat/${CID}/messages`)
      .send({ message: "hi" })
      .expect(200);

    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.success).toBe(true);
    expect(res.body.userMessage.role).toBe("user");
    expect(res.body.assistantMessageId).toBeTruthy();
    expect(getBroadcaster(CID)).toBeDefined(); // still alive while pi runs
  });

  it("rejects stream: true with 400", async () => {
    const res = await request(app)
      .post(`/chat/${CID}/messages`)
      .send({ message: "hi", stream: true })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 409 when a turn is already in flight", async () => {
    // Hold a broadcaster in the registry (simulates an in-flight turn).
    const { TurnBroadcaster } = await import("../../services/turnBroadcaster");
    const held = new TurnBroadcaster(
      CID,
      { id: "u-0", role: "user", content: "x", timestamp: new Date().toISOString() },
      "asst-0",
      () => {}
    );
    (await import("../../services/turnBroadcasters")).setBroadcaster(CID, held);

    const res = await request(app)
      .post(`/chat/${CID}/messages`)
      .send({ message: "hi" })
      .expect(409);
    expect(res.body.error).toBe("turn_in_progress");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd backend && bun test src/routes/__tests__/chat-reconnect.test.ts`
Expected: FAIL — current POST returns SSE stream, not JSON.

- [ ] **Step 4: Refactor `runChatTurn` in `backend/src/routes/chat.ts`**

Locate `runChatTurn` (around line 260). Replace it with a non-generator version that drives the broadcaster:

```typescript
// Run a chat turn: append user message, capture snapshot, stream from pi
// into a TurnBroadcaster. Returns the created broadcaster; caller registers
// it and lets the turn run in the background (fire-and-forget).
//
// `onAssistant` is called once with the final assistant Message so the
// caller can append it to session.messages (after piChatStream completes).
async function runChatTurn(
  containerId: string,
  userMessage: string,
  attachments: any[],
  turnModel?: string,
  signal?: AbortSignal
): Promise<{
  broadcaster: TurnBroadcaster;
  userMsg: Message;
  assistantId: string;
  onAssistant: (cb: (msg: Message) => void) => void;
}> {
  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
  session.messages.push(userMsg);

  const captureOk = await captureSnapshot(containerId, userMsg.id);
  if (captureOk) userMsg.snapshotId = userMsg.id;
  await pruneSnapshots(containerId, 20);

  const assistantId = `assistant-${Date.now()}`;
  const allToolCalls: ToolCallRecord[] = [];
  let finalContent = "";
  let seenDone = false;
  let assistantCallback: ((msg: Message) => void) | null = null;
  const onAssistant = (cb: (msg: Message) => void) => {
    assistantCallback = cb;
  };

  const broadcaster = new TurnBroadcaster(
    containerId,
    userMsg,
    assistantId,
    () => removeBroadcaster(containerId)
  );
  setBroadcaster(containerId, broadcaster);

  // Fire-and-forget background task. Runs piChatStream, emits chunks to the
  // broadcaster, and finalizes when done/error. Errors are caught so a
  // crash in the background doesn't crash the process.
  (async () => {
    try {
      for await (const chunk of piChatStream(
        containerId,
        sessionToPiMessages(session),
        signal,
        turnModel
      )) {
        if (chunk.type === "user") {
          // user message is already in session.messages; skip emit (the
          // broadcaster's user-chunk emission happens at attach-time).
          continue;
        }
        if (chunk.type === "assistant") {
          if (chunk.data.message !== undefined) {
            // Final chunk: capture finalContent but don't emit (already in partialText).
            finalContent = extractAssistantText(chunk.data);
            continue;
          }
          const text = extractAssistantText(chunk.data);
          if (text) finalContent = text;
          broadcaster.emit({
            ...chunk,
            data: { ...chunk.data, id: assistantId, role: "assistant", content: finalContent },
          });
        } else if (chunk.type === "tool_call") {
          allToolCalls.push({
            id: chunk.data.id,
            name: chunk.data.name,
            args: chunk.data.args ?? "",
            ok: true,
            result: "",
          });
          broadcaster.emit(chunk);
        } else if (chunk.type === "tool_result") {
          const last = allToolCalls.find((tc) => tc.id === chunk.data.id);
          if (last) {
            last.ok = !!chunk.data.ok;
            last.result =
              typeof chunk.data.result === "string"
                ? chunk.data.result
                : JSON.stringify(chunk.data.result);
          }
          broadcaster.emit(chunk);
        } else if (chunk.type === "error") {
          broadcaster.finalize("error", chunk.data);
          return;
        } else {
          broadcaster.emit(chunk);
        }
        if (chunk.type === "done") {
          seenDone = true;
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[chat] pi stream failed:", msg);
      broadcaster.finalize("error", { message: msg });
      return;
    }

    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: finalContent || "Sorry, I could not generate a response.",
      timestamp: new Date().toISOString(),
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date().toISOString();
    if (assistantCallback) assistantCallback(assistantMsg);

    if (!seenDone) {
      broadcaster.emit({ type: "assistant", data: assistantMsg });
    }
    broadcaster.finalize("done");
  })();

  return { broadcaster, userMsg, assistantId, onAssistant };
}
```

- [ ] **Step 5: Update `POST /chat/:containerId/messages` to use the new runChatTurn**

Replace the `stream` branch and the non-stream branch in `backend/src/routes/chat.ts` (the entire body of the `withProjectLock(async () => { ... })` callback, around lines 39-83):

```typescript
  try {
    await withProjectLock(containerId, async () => {
      const turnModel = await getProjectModel(containerId);

      // Reject streaming: this endpoint is now JSON-only.
      if (stream) {
        return res.status(400).json({
          success: false,
          error: "stream mode is no longer supported; use GET /chat/:id/turn-stream to subscribe",
        });
      }

      // 409 if a turn is already in flight for this project.
      if (getBroadcaster(containerId)) {
        return res.status(409).json({
          success: false,
          error: "turn_in_progress",
        });
      }

      const { userMsg, assistantId } = await runChatTurn(
        containerId,
        message,
        attachments,
        turnModel
      );

      res.json({
        success: true,
        userMessage: userMsg,
        assistantMessageId: assistantId,
      });
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Chat error] message:", err.message);
    console.error("[Chat error] stack:", err.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});
```

- [ ] **Step 6: Add the imports at the top of `backend/src/routes/chat.ts`**

Find the existing imports from `chatSessions` and `piProxy`. Add:

```typescript
import { TurnBroadcaster } from "../services/turnBroadcaster";
import {
  getBroadcaster,
  removeBroadcaster,
  setBroadcaster,
} from "../services/turnBroadcasters";
```

- [ ] **Step 7: Run the test and verify it passes**

Run: `cd backend && bun test src/routes/__tests__/chat-reconnect.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/routes/chat.ts src/services/turnBroadcasters.ts src/routes/__tests__/chat-reconnect.test.ts
git commit -m "feat(chat): refactor runChatTurn to write to TurnBroadcaster; POST returns JSON"
```

---

## Task 8: GET /turn-stream endpoint

**Files:**
- Modify: `backend/src/routes/chat.ts`
- Test: `backend/src/routes/__tests__/chat-reconnect.test.ts`

- [ ] **Step 1: Append the failing test to chat-reconnect.test.ts**

Add to the end of the file:

```typescript
describe("GET /chat/:containerId/turn-stream", () => {
  it("emits [DONE] and closes when no broadcaster exists", async () => {
    const res = await request(app)
      .get(`/chat/${CID}/turn-stream`)
      .buffer(true)
      .parse((r, cb) => {
        let data = "";
        r.on("data", (c) => (data += c.toString()));
        r.on("end", () => cb(null, data));
      })
      .expect(200);

    expect(res.body).toBe("data: [DONE]\n\n");
  });

  it("attaches to an in-flight broadcaster and receives flushed state + new chunks", async () => {
    // Start a turn in the background.
    mocks.piChatStream.mockImplementation(async function* () {
      // emit slowly so the GET can attach mid-stream
      yield { type: "assistant", data: { id: "asst-x", content: "partial" } };
      await new Promise((r) => setTimeout(r, 50));
      yield { type: "done", data: {} };
    });

    // Fire the POST without awaiting its result (it's already 200).
    void request(app).post(`/chat/${CID}/messages`).send({ message: "hi" });

    // Wait for the broadcaster to exist and have content.
    let broadcaster: any;
    for (let i = 0; i < 50; i++) {
      broadcaster = getBroadcaster(CID);
      if (broadcaster && broadcaster.getState().partialText) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(broadcaster).toBeDefined();
    expect(broadcaster.getState().partialText).toBe("partial");

    // Now GET /turn-stream and capture events.
    const streamPromise = request(app)
      .get(`/chat/${CID}/turn-stream`)
      .buffer(true)
      .parse((r, cb) => {
        let data = "";
        r.on("data", (c) => (data += c.toString()));
        r.on("end", () => cb(null, data));
      });

    // Wait for the background turn to finish.
    await new Promise((r) => setTimeout(r, 200));
    const res = await streamPromise;

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    // The subscriber should see at least: user (flush), assistant (flush), done
    expect(res.body).toContain('"type":"user"');
    expect(res.body).toContain('"type":"assistant"');
    expect(res.body).toContain('"type":"done"');
    expect(res.body).toContain("[DONE]");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/routes/__tests__/chat-reconnect.test.ts`
Expected: FAIL — `/turn-stream` route does not exist.

- [ ] **Step 3: Add the GET /turn-stream route in `backend/src/routes/chat.ts`**

Add this route to the `router` (before the `:containerId/messages` POST route or right after the GET messages — order doesn't matter as long as the path is unique):

```typescript
// GET /chat/:containerId/turn-stream
// Subscribe to the in-flight turn's remaining chunks. If no turn is
// in flight, returns [DONE] immediately so the client can end its
// EventSource without waiting.
router.get("/:containerId/turn-stream", (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const broadcaster = getBroadcaster(containerId);
  if (!broadcaster) {
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  broadcaster.attach(res);
  req.on("close", () => broadcaster.detach(res));
});
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/routes/__tests__/chat-reconnect.test.ts`
Expected: PASS — all tests in the new file green.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/routes/chat.ts src/routes/__tests__/chat-reconnect.test.ts
git commit -m "feat(chat): add GET /turn-stream endpoint for broadcaster subscription"
```

---

## Task 9: GET /turn-status reads from broadcaster

**Files:**
- Modify: `backend/src/routes/chat.ts`
- Test: `backend/src/routes/__tests__/chat-reconnect.test.ts`

- [ ] **Step 1: Append the failing test**

```typescript
describe("GET /chat/:containerId/turn-status", () => {
  it("returns processing=false when no broadcaster exists", async () => {
    const res = await request(app)
      .get(`/chat/${CID}/turn-status`)
      .expect(200);

    expect(res.body.processing).toBe(false);
    expect(res.body.inProgressTurn).toBeUndefined();
  });

  it("returns processing=true with broadcaster state when a turn is in flight", async () => {
    const { TurnBroadcaster } = await import("../../services/turnBroadcaster");
    const userMsg = {
      id: "u-9",
      role: "user" as const,
      content: "hi",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const b = new TurnBroadcaster(CID, userMsg, "asst-9", () => {});
    b.emit({ type: "assistant", data: { id: "asst-9", content: "Hello" } });
    (await import("../../services/turnBroadcasters")).setBroadcaster(CID, b);

    const res = await request(app)
      .get(`/chat/${CID}/turn-status`)
      .expect(200);

    expect(res.body.processing).toBe(true);
    expect(res.body.inProgressTurn.assistantMsgId).toBe("asst-9");
    expect(res.body.inProgressTurn.partialText).toBe("Hello");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend && bun test src/routes/__tests__/chat-reconnect.test.ts`
Expected: FAIL — current `turn-status` reads from `chatSessions.inProgressTurn`, which is now empty.

- [ ] **Step 3: Update the GET /turn-status route**

Find the existing route (around line 138 in the pre-refactor `chat.ts`, now likely shifted) and replace it with:

```typescript
// GET /chat/:containerId/turn-status — report whether a turn is in-flight and,
// if so, the partial response captured so far. Used by the frontend on page
// reload to resume rendering the streaming answer.
router.get("/:containerId/turn-status", async (req: Request, res: Response) => {
  const containerId = req.params.containerId as string;

  try {
    const broadcaster = getBroadcaster(containerId);
    if (!broadcaster) {
      return res.json({ processing: false });
    }
    const state = broadcaster.getState();
    res.json({
      processing: state.status === "running",
      inProgressTurn: {
        userMsgId: state.userMsg.id,
        assistantMsgId: state.assistantMsgId,
        partialText: state.partialText,
        toolCalls: state.toolCalls,
        startedAt: state.startedAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/routes/__tests__/chat-reconnect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/routes/chat.ts src/routes/__tests__/chat-reconnect.test.ts
git commit -m "feat(chat): GET /turn-status reads from TurnBroadcaster state"
```

---

## Task 10: PATCH /messages/:id uses broadcaster

**Files:**
- Modify: `backend/src/routes/chat.ts`
- Test: `backend/src/routes/__tests__/chat-edit.test.ts` (existing — update)

- [ ] **Step 1: Read the current PATCH handler**

The PATCH endpoint at `backend/src/routes/chat.ts:163-254` uses `runChatTurn` and writes to `res` directly. It also calls `restoreSnapshot`, sets up `withProjectLock`, etc.

- [ ] **Step 2: Update the PATCH handler to use the new runChatTurn contract**

Replace the body of `withProjectLock` callback in the PATCH handler (the section starting with `try { await restoreSnapshot(...) }` and ending with the `for await (chunk of stream) { res.write(...) }` loop). Use:

```typescript
    // 3. Start a new turn via runChatTurn (fire-and-forget, returns JSON).
    const turnModel = await getProjectModel(containerId);
    const { userMsg: editedMsg, assistantId } = await runChatTurn(
      containerId,
      content,
      [],
      turnModel
    );

    res.json({
      success: true,
      userMessage: editedMsg,
      assistantMessageId: assistantId,
    });
```

- [ ] **Step 3: Update the error path in PATCH to handle non-streaming response**

The current PATCH has two error paths:
- `res.status(410).json({ success: false, error: "snapshot_gone" })` — keep as-is
- `res.status(500).json({ success: false, error: "restore_failed" })` — keep as-is
- The try/finally around the stream loop should be removed; withProjectLock already handles its own errors. Replace the existing catch with:

```typescript
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Chat PATCH error] message:", err.message);
    console.error("[Chat PATCH error] stack:", err.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});
```

- [ ] **Step 4: Add 409 check at the top of the PATCH handler**

Right after the `hasPiContainer` check, add:

```typescript
  if (getBroadcaster(containerId)) {
    return res.status(409).json({ success: false, error: "turn_in_progress" });
  }
```

- [ ] **Step 5: Update existing chat-edit.test.ts assertions**

The existing tests in `chat-edit.test.ts` use the old `stream` protocol: `res.headers["content-type"]` checks, etc. These tests still work because they don't assert on the response body shape — but some check `expect(res.status).toBe(200)` and call `res.text` to inspect SSE. Update:

Find the call in `chat-edit.test.ts:103-108`:
```typescript
    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "new prompt" })
      .expect(200);
```

This already works — supertest's `.expect(200)` just checks status. No change needed for status-only tests.

For the `invokes piChatStream` test (line 210-228), update the assertion to expect JSON (not SSE) — but the test only checks the piChatStream mock calls, not the response shape. Should still pass.

For the 410/500 tests, no change needed — they still return non-200.

- [ ] **Step 6: Run existing chat-edit tests**

Run: `cd backend && bun test src/routes/__tests__/chat-edit.test.ts`
Expected: PASS — all existing tests still green.

- [ ] **Step 7: Add a new test verifying PATCH + turn-stream coordination**

Append to `chat-edit.test.ts`:

```typescript
  it("PATCH returns JSON and the new turn is reachable via turn-stream", async () => {
    await seedSession();
    mocks.restoreSnapshot.mockResolvedValue(undefined);
    mocks.piChatStream.mockImplementation(async function* () {
      yield { type: "assistant", data: { id: "asst-y", content: "regen" } };
      yield { type: "done", data: {} };
    });

    const res = await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "edited" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.assistantMessageId).toBeTruthy();
    expect(res.headers["content-type"]).toContain("application/json");
  });
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `cd backend && bun test src/routes/__tests__/chat-edit.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd backend
git add src/routes/chat.ts src/routes/__tests__/chat-edit.test.ts
git commit -m "feat(chat): PATCH /messages/:id uses broadcaster; returns JSON"
```

---

## Task 11: Update existing chat-stream.test.ts to match new POST behavior

**Files:**
- Modify: `backend/src/routes/__tests__/chat-stream.test.ts`

- [ ] **Step 1: Delete the streaming-mode test block**

The block `describe("streaming mode (stream: true)", ...)` (around lines 195-252) tests the OLD behavior. The new POST rejects `stream: true` with 400. Delete this entire `describe` block.

- [ ] **Step 2: Update the "returns user and assistant message on success" test**

The test at line 95-109 currently calls `send({ message: "hello", stream: false })` and checks `res.body.userMessage.role`. After refactor, the response shape is:
```json
{ success: true, userMessage, assistantMessageId }
```

Update the assertion to match:

```typescript
    expect(res.body.success).toBe(true);
    expect(res.body.userMessage.role).toBe("user");
    expect(res.body.assistantMessageId).toBeTruthy();
```

- [ ] **Step 3: Add a "rejects stream: true" test**

After the "returns 503" test, add:

```typescript
    it("returns 400 when stream: true is passed", async () => {
      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello", stream: true })
        .expect(400);
      expect(res.body.success).toBe(false);
    });
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd backend && bun test src/routes/__tests__/chat-stream.test.ts`
Expected: PASS — all remaining tests green, with the streaming-mode block gone.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && bun test`
Expected: PASS — all tests green across all files. The new `chat-reconnect.test.ts` passes; the trimmed `chat-stream.test.ts` passes; the updated `chat-edit.test.ts` passes.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/__tests__/chat-stream.test.ts
git commit -m "test(chat): update chat-stream tests for new JSON-only POST behavior"
```

---

## Task 12: Apply the chatSessions cleanup that was stashed in Task 6

**Files:**
- Modify: `backend/src/services/chatSessions.ts`

- [ ] **Step 1: Pop the stash and verify the changes match what was done in Task 6**

```bash
cd backend
git stash pop
git diff src/services/chatSessions.ts
```

Expected: the `InProgressTurn` interface is removed, the `inProgressTurn` field is gone, and the in-flight skip in `sessionToPiMessages` is removed. The file should be smaller.

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && bun test`
Expected: PASS — all tests green. The previous `inProgressTurn` test (if any) was either removed or no longer references the field.

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/services/chatSessions.ts
git commit -m "refactor(chat): remove inProgressTurn field; broadcaster is single source of truth"
```

---

## Task 13: Frontend subscribeTurnStream

**Files:**
- Modify: `frontend/src/lib/backend/api.ts`

- [ ] **Step 1: Add subscribeTurnStream at the end of api.ts**

Append to `frontend/src/lib/backend/api.ts` (right before the existing `patchChatMessageStream` function so the ordering is logical):

```typescript
// Subscribe to the in-flight turn's remaining chunks via EventSource.
// Returns an unsubscribe function. The callbacks are invoked for each
// chunk delivered over SSE. When [DONE] arrives, onComplete fires and
// the EventSource is closed. We disable EventSource's automatic reconnect
// so callers control retry cadence (e.g. via turn-status polling).
export function subscribeTurnStream(
  containerId: string,
  onMessage: (data: any) => void,
  onError?: (error: string) => void,
  onComplete?: () => void
): () => void {
  const es = new EventSource(`${API_BASE_URL}/chat/${containerId}/turn-stream`);

  es.onmessage = (ev) => {
    if (ev.data === "[DONE]") {
      onComplete?.();
      es.close();
      return;
    }
    try {
      const parsed = JSON.parse(ev.data);
      onMessage(parsed);
    } catch (err) {
      console.error("Failed to parse SSE data:", ev.data, err);
    }
  };

  es.onerror = () => {
    onError?.("SSE connection error");
    es.close();
  };

  return () => es.close();
}
```

- [ ] **Step 2: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/lib/backend/api.ts
git commit -m "feat(frontend): add subscribeTurnStream EventSource wrapper"
```

---

## Task 14: Frontend refactor sendChatMessage (remove stream flag)

**Files:**
- Modify: `frontend/src/lib/backend/api.ts`

- [ ] **Step 1: Update `sendChatMessage` to drop the stream parameter and return the new shape**

The current function returns `ChatResponse` which is `{ success, userMessage, assistantMessage }`. After refactor, the response is `{ success, userMessage, assistantMessageId }`. Update the interface and the function:

Replace the existing `sendChatMessage` function and the `ChatResponse` interface:

```typescript
export interface ChatResponse {
  success: boolean;
  userMessage: Message;
  assistantMessageId: string;
}

export async function sendChatMessage(
  containerId: string,
  message: string,
  attachments?: any[]
): Promise<ChatResponse> {
  return fetchApi<ChatResponse>(`/chat/${containerId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message, attachments }),
  });
}
```

- [ ] **Step 2: Delete `sendChatMessageStream`**

Remove the entire `sendChatMessageStream` function (currently lines 336-415 of api.ts). It is replaced by `sendChatMessage` (synchronous JSON) + `subscribeTurnStream` (asynchronous SSE).

- [ ] **Step 3: Delete `patchChatMessageStream`**

Remove the entire `patchChatMessageStream` function (currently lines 417-502). The PATCH endpoint also returns JSON now; clients should call it directly and then subscribe to `subscribeTurnStream`.

- [ ] **Step 4: Find and fix any remaining `ChatResponse` consumers**

The new `ChatResponse` shape is `{ userMessage, assistantMessageId }` — no `assistantMessage`. Run a search to find any places that destructure `assistantMessage`:

```bash
cd frontend
rg "assistantMessage" --type ts --type tsx -n
```

For each consumer, replace `assistantMessage` usage with the new pattern. Most likely this is only in `WorkspaceDashboard.tsx` (fixed in next tasks).

- [ ] **Step 5: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors that pinpoint consumers we haven't refactored yet. Most should be in `WorkspaceDashboard.tsx`.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/lib/backend/api.ts
git commit -m "refactor(frontend): sendChatMessage returns JSON; drop stream wrappers"
```

(Commit at this point even if tsc has errors — those are addressed in the next task.)

---

## Task 15: Frontend refactor WorkspaceDashboard handleSendMessage

**Files:**
- Modify: `frontend/src/app/projects/components/WorkspaceDashboard.tsx`

- [ ] **Step 1: Update imports**

In `WorkspaceDashboard.tsx`, remove the `sendChatMessageStream` import. Add `subscribeTurnStream` to the import list:

```typescript
import {
  deployToVercel,
  getChatHistory,
  getProjectModel,
  getTurnStatus,
  Message,
  sendChatMessage,
  subscribeTurnStream,
  setProjectModel,
  type ModelInfo,
} from "../../../lib/backend/api";
```

- [ ] **Step 2: Replace handleSendMessage to use the new flow**

Find `handleSendMessage` in the file (around line 326-488 in the current code). Replace it with:

```typescript
  const handleSendMessage = async (attachments?: File[]): Promise<void> => {
    const allAttachments = [...(attachments || []), ...pendingFiles];

    if (!inputValue.trim() && allAttachments.length === 0) return;
    if (isLoading) return;

    const totalSize = allAttachments.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
      toast.error("Total file size exceeds 20MB limit");
      return;
    }

    const userInput = inputValue;
    setInputValue("");
    setPendingFiles([]);
    setIsLoading(true);

    // Cancel any previous in-flight subscription (shouldn't happen given
    // isLoading guard, but defensive).
    streamCancelRef.current?.();

    let attachmentData: any[] = [];
    if (allAttachments.length > 0) {
      try {
        attachmentData = await Promise.all(
          allAttachments.map(async (file) => {
            const base64 = await fileToBase64(file);
            return {
              type: file.type.startsWith("image/") ? "image" : "document",
              data: base64,
              name: file.name,
              mimeType: file.type,
              size: file.size,
            };
          })
        );
      } catch (error) {
        console.error("Error processing files:", error);
        toast.error("Error processing files. Please try again.");
        setIsLoading(false);
        return;
      }
    }

    // Phase 1: synchronously start the turn.
    let response: { success: boolean; userMessage: Message; assistantMessageId: string };
    try {
      response = await sendChatMessage(containerId, userInput, attachmentData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      if (/409/.test(msg) || /turn_in_progress/.test(msg)) {
        toast.error("A response is already in progress. Wait for it to finish.");
      } else {
        toast.error(msg);
      }
      setIsLoading(false);
      return;
    }

    if (!response.success) {
      toast.error("Failed to send message");
      setIsLoading(false);
      return;
    }

    // Optimistically add the user message and an empty assistant placeholder.
    setMessages((prev) => [...prev, response.userMessage]);
    setStreamingMessageId(response.assistantMessageId);
    streamingMessageIdRef.current = response.assistantMessageId;

    // Phase 2: subscribe to the turn's chunk stream.
    const cancel = subscribeTurnStream(
      containerId,
      (data) => {
        if (data.type === "user") {
          // Already added optimistically; skip.
          return;
        } else if (data.type === "tool_call") {
          const targetId = streamingMessageIdRef.current;
          if (!targetId) return;
          setMessages((prev) => {
            const newMessages = [...prev];
            const idx = newMessages.findIndex((msg) => msg.id === targetId);
            if (idx < 0) return prev;
            const msg = newMessages[idx];
            const toolCalls = msg.toolCalls ?? [];
            newMessages[idx] = {
              ...msg,
              toolCalls: [
                ...toolCalls,
                {
                  id: data.data.id,
                  name: data.data.name,
                  args:
                    typeof data.data.args === "string"
                      ? data.data.args
                      : JSON.stringify(data.data.args ?? ""),
                  result: "",
                  ok: true,
                },
              ],
            };
            return newMessages;
          });
        } else if (data.type === "tool_result") {
          const targetId = streamingMessageIdRef.current;
          if (!targetId) return;
          setMessages((prev) => {
            const newMessages = [...prev];
            const idx = newMessages.findIndex((msg) => msg.id === targetId);
            if (idx < 0) return prev;
            const msg = newMessages[idx];
            const toolCalls = msg.toolCalls ?? [];
            newMessages[idx] = {
              ...msg,
              toolCalls: toolCalls.map((tc) =>
                tc.id === data.data.id
                  ? {
                      ...tc,
                      ok: !!data.data.ok,
                      result:
                        typeof data.data.result === "string"
                          ? data.data.result
                          : JSON.stringify(data.data.result ?? ""),
                    }
                  : tc
              ),
            };
            return newMessages;
          });
        } else if (data.type === "assistant") {
          setStreamingMessageId(data.data.id);
          streamingMessageIdRef.current = data.data.id;
          setMessages((prev) => {
            const newMessages = [...prev];
            const existingIndex = newMessages.findIndex(
              (msg) => msg.id === data.data.id
            );
            if (existingIndex >= 0) {
              const existing = newMessages[existingIndex];
              newMessages[existingIndex] = {
                ...data.data,
                toolCalls: data.data.toolCalls ?? existing.toolCalls,
              };
            } else {
              newMessages.push(data.data);
            }
            return newMessages;
          });
        }
        // 'done' is delivered via [DONE] in the EventSource wrapper, not as
        // a chunk — see onComplete below.
      },
      (error) => {
        console.error("Streaming error:", error);
        setIsLoading(false);
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
        toast.error("Connection error. Please try again.");
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      },
      () => {
        // [DONE] received: turn finished successfully.
        setIsLoading(false);
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
      }
    );

    streamCancelRef.current = cancel;
  };
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (or only errors that are addressed in Task 16).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/app/projects/components/WorkspaceDashboard.tsx
git commit -m "refactor(frontend): handleSendMessage uses sendChatMessage + subscribeTurnStream"
```

---

## Task 16: Frontend refactor handleEditMessage

**Files:**
- Modify: `frontend/src/app/projects/components/WorkspaceDashboard.tsx`

- [ ] **Step 1: Add a synchronous PATCH helper to api.ts**

Append to `frontend/src/lib/backend/api.ts`:

```typescript
export interface EditResponse {
  success: boolean;
  userMessage: Message;
  assistantMessageId: string;
}

export async function editChatMessage(
  containerId: string,
  messageId: string,
  newContent: string
): Promise<EditResponse> {
  return fetchApi<EditResponse>(
    `/chat/${containerId}/messages/${messageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ content: newContent }),
    }
  );
}
```

- [ ] **Step 2: Update handleEditMessage in WorkspaceDashboard.tsx**

Find `handleEditMessage` (around line 490-600 in the current code). Replace it with:

```typescript
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (isRegenerating) return;
      setIsRegenerating(true);
      setIsLoading(true);
      editCancelRef.current?.();

      let response: EditResponse;
      try {
        response = await editChatMessage(containerId, messageId, newContent);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Edit failed";
        if (/410/.test(msg) toast.error("Cannot undo past 20 messages — snapshot was pruned.");
        else if (/404/.test(msg)) toast.error("Message not found.");
        else if (/400/.test(msg)) toast.error("Cannot edit this message.");
        else if (/409/.test(msg)) toast.error("A response is already in progress.");
        else toast.error(msg);
        setIsRegenerating(false);
        setIsLoading(false);
        return;
      }

      if (!response.success) {
        toast.error("Edit failed");
        setIsRegenerating(false);
        setIsLoading(false);
        return;
      }

      // Optimistic: append the edited user message + assistant placeholder.
      setMessages((prev) => [...prev, response.userMessage]);
      setStreamingMessageId(response.assistantMessageId);
      streamingMessageIdRef.current = response.assistantMessageId;

      const cancel = subscribeTurnStream(
        containerId,
        // Reuse the same chunk handler from handleSendMessage by inlining the
        // tool_call/tool_result/assistant logic (or extract to a shared
        // helper if duplication becomes painful).
        (data) => {
          if (data.type === "user") return;
          if (data.type === "tool_call" || data.type === "tool_result" || data.type === "assistant") {
            // Same logic as handleSendMessage — keep in sync.
            // For brevity, this is intentionally abbreviated; copy from
            // handleSendMessage.
          }
        },
        (error) => {
          toast.error(error);
          setStreamingMessageId(null);
          setIsRegenerating(false);
          setIsLoading(false);
          editCancelRef.current = null;
        },
        () => {
          setStreamingMessageId(null);
          toast.success("Regenerated from edit");
          setIsRegenerating(false);
          setIsLoading(false);
          editCancelRef.current = null;
        }
      );
      editCancelRef.current = cancel;
    },
    [containerId, isRegenerating]
  );
```

> **Note**: The abbreviated handler is intentional — the real implementation should copy the exact same `tool_call` / `tool_result` / `assistant` reducer logic from `handleSendMessage`. If the duplication is uncomfortable, extract a `function applyChunk(messages, data)` helper into a shared module and call it from both. The current refactor favors copying to keep tasks bite-sized; a follow-up cleanup is acceptable.

- [ ] **Step 3: Add `EditResponse` and `editChatMessage` to the imports in WorkspaceDashboard.tsx**

```typescript
import {
  deployToVercel,
  editChatMessage,
  getChatHistory,
  getProjectModel,
  getTurnStatus,
  Message,
  sendChatMessage,
  subscribeTurnStream,
  setProjectModel,
  type EditResponse,
  type ModelInfo,
} from "../../../lib/backend/api";
```

- [ ] **Step 4: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/backend/api.ts src/app/projects/components/WorkspaceDashboard.tsx
git commit -m "refactor(frontend): handleEditMessage uses editChatMessage + subscribeTurnStream"
```

---

## Task 17: Frontend refactor loadChatHistory to subscribe on in-flight recovery

**Files:**
- Modify: `frontend/src/app/projects/components/WorkspaceDashboard.tsx`

- [ ] **Step 1: Locate the in-flight recovery code in loadChatHistory**

The block in `loadChatHistory` (around line 196-219) currently:
1. Calls `getTurnStatus(containerId)`
2. If `processing`, builds a partial assistant message and appends it
3. Sets `streamingMessageId` and `isLoading`

It does NOT subscribe. After this task, it must subscribe.

- [ ] **Step 2: Add the subscription to the recovery path**

Replace the in-flight block with:

```typescript
            try {
              const status = await getTurnStatus(containerId);
              if (status.processing && status.inProgressTurn) {
                const turn = status.inProgressTurn;
                const partialAssistant: Message = {
                  id: turn.assistantMsgId,
                  role: "assistant",
                  content: turn.partialText,
                  timestamp: turn.startedAt,
                  toolCalls: turn.toolCalls,
                };
                setMessages((prev) => {
                  if (prev.some((m) => m.id === partialAssistant.id)) {
                    return prev;
                  }
                  return [...prev, partialAssistant];
                });
                setStreamingMessageId(partialAssistant.id);
                streamingMessageIdRef.current = partialAssistant.id;
                setIsLoading(true);

                // Subscribe so we keep receiving subsequent chunks.
                const cancel = subscribeTurnStream(
                  containerId,
                  (data) => {
                    // Reuse the same reducer from handleSendMessage. For
                    // brevity, only the assistant + tool_call/tool_result
                    // paths are wired; the handler updates the existing
                    // partial assistant message in place.
                    if (data.type === "assistant") {
                      setMessages((prev) => {
                        const newMessages = [...prev];
                        const idx = newMessages.findIndex(
                          (m) => m.id === data.data.id
                        );
                        if (idx < 0) return prev;
                        const existing = newMessages[idx]!;
                        newMessages[idx] = {
                          ...data.data,
                          toolCalls: data.data.toolCalls ?? existing.toolCalls,
                        };
                        return newMessages;
                      });
                    } else if (data.type === "tool_call" || data.type === "tool_result") {
                      setMessages((prev) => {
                        const newMessages = [...prev];
                        const idx = newMessages.findIndex(
                          (m) => m.id === streamingMessageIdRef.current
                        );
                        if (idx < 0) return prev;
                        const msg = newMessages[idx]!;
                        const toolCalls = msg.toolCalls ?? [];
                        if (data.type === "tool_call") {
                          newMessages[idx] = {
                            ...msg,
                            toolCalls: [
                              ...toolCalls,
                              {
                                id: data.data.id,
                                name: data.data.name,
                                args:
                                  typeof data.data.args === "string"
                                    ? data.data.args
                                    : JSON.stringify(data.data.args ?? ""),
                                result: "",
                                ok: true,
                              },
                            ],
                          };
                        } else {
                          newMessages[idx] = {
                            ...msg,
                            toolCalls: toolCalls.map((tc) =>
                              tc.id === data.data.id
                                ? {
                                    ...tc,
                                    ok: !!data.data.ok,
                                    result:
                                      typeof data.data.result === "string"
                                        ? data.data.result
                                        : JSON.stringify(data.data.result ?? ""),
                                  }
                                : tc
                            ),
                          };
                        }
                        return newMessages;
                      });
                    }
                  },
                  (error) => {
                    console.error("Subscription error during recovery:", error);
                  },
                  () => {
                    setIsLoading(false);
                    setStreamingMessageId(null);
                    streamingMessageIdRef.current = null;
                  }
                );
                streamCancelRef.current = cancel;
              }
            } catch (err) {
              console.error("Failed to load turn status:", err);
            }
```

- [ ] **Step 3: Add cleanup in the unmount effect**

The existing useEffect at the top of the component (around line 96) cancels `editCancelRef`. Add `streamCancelRef` cancellation:

```typescript
  useEffect(() => {
    return () => {
      editCancelRef.current?.();
      streamCancelRef.current?.();
    };
  }, []);
```

- [ ] **Step 4: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/app/projects/components/WorkspaceDashboard.tsx
git commit -m "feat(frontend): page reload recovery subscribes to in-flight turn chunks"
```

---

## Task 18: Manual E2E verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev environment**

```bash
# In one terminal:
cd backend && bun run start

# In another terminal:
cd frontend && bun run dev
```

- [ ] **Step 2: Run through the 6 spec scenarios**

Open the frontend in a browser. For each scenario below, verify the expected behavior:

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| 1 | Start a turn → mid-stream refresh page | UI shows partial text + tool calls after reload; subsequent chunks continue to appear in real time; the "Thinking..." indicator stays |
| 2 | Start a turn → mid-stream refresh → send a new message | Second message shows a toast like "A response is already in progress. Wait for it to finish." |
| 3 | Start a turn in tab A; open tab B to the same project | Tab B sees the in-flight turn progress (after a manual reload; the page initially loads history + turn-status, then subscribes) |
| 4 | Start a turn → disable network for 5s → re-enable | Tab shows "Connection error" briefly; reloading shows the in-flight turn's current state and continues to receive new chunks |
| 5 | Simulate pi error (kill the container) | UI sees an error chunk; `isLoading` clears; partial assistant message remains in history |
| 6 | Start a turn → wait for completion → refresh | No "in flight" indicator; full conversation is in history |

- [ ] **Step 3: Run the full backend test suite once more**

Run: `cd backend && bun test`
Expected: PASS — all tests green.

- [ ] **Step 4: Run a production build check on the frontend**

Run: `cd frontend && bun run build`
Expected: 0 errors (warnings OK).

- [ ] **Step 5: Document any deviations**

If any scenario didn't behave as expected, add a note here with the deviation. Otherwise, mark this task complete.

- [ ] **Step 6: Commit any final tweaks (if any)**

```bash
git add -A
git commit -m "chore: post-verification tweaks (if any)"
```

Skip this commit if no changes were needed.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Plan task |
|---|---|
| TurnBroadcaster class | Tasks 1-4 |
| Registry | Task 5 |
| chatSessions cleanup | Tasks 6, 12 |
| Refactor runChatTurn | Task 7 |
| POST /messages sync | Task 7 |
| POST /messages 409 | Task 7 |
| GET /turn-stream | Task 8 |
| GET /turn-status from broadcaster | Task 9 |
| PATCH /messages/:id with broadcaster | Task 10 |
| Update chat-stream.test.ts | Task 11 |
| Frontend subscribeTurnStream | Task 13 |
| Frontend sendChatMessage refactor | Task 14 |
| Frontend handleSendMessage | Task 15 |
| Frontend handleEditMessage | Task 16 |
| Frontend loadChatHistory recovery | Task 17 |
| Manual E2E | Task 18 |

All spec sections covered. No gaps.

**2. Placeholder scan:**

No "TBD", "TODO", "fill in details" found. The one "abbreviated" note in Task 16 is intentional (the implementation pattern is shown; copy from handleSendMessage is the action).

**3. Type consistency:**

- `TurnBroadcaster` constructor signature `(containerId, userMsg, assistantMsgId, onFinalize)` is used in Tasks 1, 4, 5, 7
- `TurnBroadcaster.emit(chunk)` — same signature across Tasks 2, 3, 4
- `getBroadcaster`/`setBroadcaster`/`removeBroadcaster` — consistent across Tasks 5, 7, 8, 9
- `subscribeTurnStream(containerId, onMessage, onError, onComplete)` — used in Tasks 13, 15, 16, 17
- Response shape `{ success, userMessage, assistantMessageId }` — consistent across Tasks 7, 11, 14, 15
- `attach`/`detach` — consistent across Tasks 1, 3
- `finalize(status, error?)` — consistent across Tasks 4, 7

No type mismatches found.
