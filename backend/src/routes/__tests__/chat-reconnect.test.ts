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
    let releaseTurn: (() => void) | null = null;
    mocks.piChatStream.mockImplementation(async function* () {
      yield { type: "assistant", data: { id: "asst-1", content: "Hello" } };
      // Hold the turn open until the test signals it has observed the
      // broadcaster. Without this, the IIFE drains before the test reads.
      await new Promise<void>((r) => {
        releaseTurn = r;
      });
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
    releaseTurn?.();
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
