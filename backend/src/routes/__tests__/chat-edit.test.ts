import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Mock state must be hoisted before the vi.mock factory closures run.
const mocks = vi.hoisted(() => {
  return {
    captureSnapshot: vi.fn().mockResolvedValue(undefined),
    restoreSnapshot: vi.fn().mockResolvedValue(undefined),
    listSnapshots: vi.fn().mockResolvedValue([]),
    pruneSnapshots: vi.fn().mockResolvedValue(undefined),
    deleteSnapshot: vi.fn().mockResolvedValue(undefined),
    sendMessageStream: vi.fn(),
  };
});

vi.mock("../../services/snapshots", () => ({
  captureSnapshot: mocks.captureSnapshot,
  restoreSnapshot: mocks.restoreSnapshot,
  listSnapshots: mocks.listSnapshots,
  pruneSnapshots: mocks.pruneSnapshots,
  deleteSnapshot: mocks.deleteSnapshot,
}));

vi.mock("../../services/llm", async () => {
  const actual = await vi.importActual<any>("../../services/llm");
  return {
    ...actual,
    sendMessageStream: (...args: any[]) => mocks.sendMessageStream(...args),
  };
});

import chatRouter from "../chat";
import { __resetLocksForTests } from "../../services/locks";
import * as llmService from "../../services/llm";

const app = express();
app.use(express.json());
app.use("/chat", chatRouter);

beforeEach(() => {
  mocks.captureSnapshot.mockClear();
  mocks.restoreSnapshot.mockClear();
  mocks.sendMessageStream.mockReset();
  __resetLocksForTests();
  // Clear the in-memory chat sessions map
  llmService.chatSessions.clear();
});

afterEach(() => {
  llmService.chatSessions.clear();
});

const CID = "cid-1";
const MID = "user-42";

async function seedSession() {
  const session = llmService.getOrCreateChatSession(CID);
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
    mocks.restoreSnapshot.mockImplementation(async () => {
      callOrder.push("restore");
    });
    mocks.sendMessageStream.mockImplementation(async function* () {
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
    mocks.restoreSnapshot.mockResolvedValue(undefined);
    mocks.sendMessageStream.mockImplementation(async function* () {
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
    await seedSession();
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

  it("returns 410 when snapshot tarball is missing (restoreSnapshot throws ENOENT)", async () => {
    await seedSession();
    mocks.restoreSnapshot.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    mocks.sendMessageStream.mockImplementation(async function* () {
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
    mocks.restoreSnapshot.mockRejectedValue(new Error("tarball corrupt"));
    mocks.sendMessageStream.mockImplementation(async function* () {
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
    mocks.restoreSnapshot.mockResolvedValue(undefined);
    mocks.sendMessageStream.mockImplementation(async function* () {
      yield { type: "done", data: {} };
    });
    await request(app)
      .patch(`/chat/${CID}/messages/${MID}`)
      .send({ content: "brand new prompt" })
      .expect(200);
    expect(mocks.sendMessageStream).toHaveBeenCalledWith(
      CID,
      "brand new prompt",
      [],
      undefined
    );
  });
});
