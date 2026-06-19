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
