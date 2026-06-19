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

describe("TurnBroadcaster — emit()", () => {
  it("writes a chunk to every attached subscriber", () => {
    const b = new TurnBroadcaster(CID, userMsg, "asst-1", () => {});
    const a = makeFakeRes();
    const c = makeFakeRes();
    b.attach(a);
    b.attach(c);

    const writesBefore = a.writes.length;
    b.emit({ type: "assistant", data: { id: "asst-1", content: "hi" } });

    // attach() flushes a user chunk, so the emit appends one more write.
    const newA = a.writes.slice(writesBefore);
    const newC = c.writes.slice(writesBefore);
    expect(newA).toEqual([`data: ${JSON.stringify({ type: "assistant", data: { id: "asst-1", content: "hi" } })}\n\n`]);
    expect(newC).toEqual(newA);
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

    const writesBefore = good.writes.length;
    expect(() => b.emit({ type: "assistant", data: { id: "asst-1", content: "hi" } })).not.toThrow();
    // attach() flushed the user chunk; emit() appends one more.
    expect(good.writes.length - writesBefore).toBe(1);
  });
});

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
