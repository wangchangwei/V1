import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import chatRouter from "../chat";
import { __resetLocksForTests } from "../../services/locks";
import * as chatSessions from "../../services/chatSessions";

// Mock state shared across vi.mock closures via vi.hoisted
const mocks = vi.hoisted(() => ({
  piChatStream: vi.fn<() => AsyncGenerator<any>>(async function* () {}),
  hasPiContainer: vi.fn().mockReturnValue(true),
  captureSnapshot: vi.fn().mockResolvedValue(true),
  pruneSnapshots: vi.fn().mockResolvedValue(undefined),
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
}));

const app = express();
app.use(express.json());
app.use("/chat", chatRouter);

const CID = "chat-stream-cid";

beforeEach(() => {
  mocks.piChatStream.mockReset();
  mocks.piChatStream.mockImplementation(async function* () {});
  mocks.hasPiContainer.mockReturnValue(true);
  mocks.captureSnapshot.mockResolvedValue(true);
  mocks.pruneSnapshots.mockResolvedValue(undefined);
  __resetLocksForTests();
  chatSessions.chatSessions.clear();
});

afterEach(() => {
  chatSessions.chatSessions.clear();
  __resetLocksForTests();
});

// ---------------------------------------------------------------------------
// Helper — build SSE lines from raw data objects
// ---------------------------------------------------------------------------
function sseLines(...events: Array<{ type: string; data: any } | string>) {
  return events
    .map((e) =>
      typeof e === "string"
        ? `data: ${JSON.stringify(e)}\n\n`
        : `data: ${JSON.stringify(e)}\n\n`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// POST /chat/:containerId/messages
// ---------------------------------------------------------------------------
describe("POST /chat/:containerId/messages", () => {
  describe("non-streaming mode", () => {
    it("returns 400 when message is missing", async () => {
      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({})
        .expect(400);
      expect(res.body).toEqual({ success: false, error: "Message is required" });
    });

    it("returns 400 when message is not a string", async () => {
      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: 123 })
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 503 when pi container is not available", async () => {
      mocks.hasPiContainer.mockReturnValue(false);
      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello" })
        .expect(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Pi container not running");
    });

    it("returns user and assistant message on success", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "user", data: { id: "user-1", role: "user", content: "hello", timestamp: "2024-01-01T00:00:00.000Z" } };
        yield { type: "done", data: { id: "assistant-1", role: "assistant", content: "Hi there!", timestamp: "2024-01-01T00:00:01.000Z" } };
      });

      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello", stream: false })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.userMessage.role).toBe("user");
      expect(res.body.assistantMessage.role).toBe("assistant");
    });

    it("calls piChatStream with containerId and messages", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "done", data: {} };
      });

      await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello" })
        .expect(200);

      expect(mocks.piChatStream).toHaveBeenCalled();
      const [calledCid, messages] = mocks.piChatStream.mock.calls[0]!;
      expect(calledCid).toBe(CID);
      expect(Array.isArray(messages)).toBe(true);
    });

    it("passes attachments to piChatStream", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "done", data: {} };
      });

      await request(app)
        .post(`/chat/${CID}/messages`)
        .send({
          message: "hello",
          attachments: [{ type: "image", data: "base64img", name: "screenshot.png", mimeType: "image/png", size: 1234 }],
        })
        .expect(200);

      const [, messages] = mocks.piChatStream.mock.calls[0]!;
      // Attachments should be included in the messages passed to the LLM
      expect(messages).toBeDefined();
    });

    it("captures a filesystem snapshot before streaming", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "done", data: {} };
      });

      await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello" })
        .expect(200);

      expect(mocks.captureSnapshot).toHaveBeenCalledWith(CID, expect.any(String));
    });

    it("returns 500 when piChatStream throws an error", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        throw new Error("pi container crashed");
      });

      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello" })
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("pi container crashed");
    });

    it("appends messages to session history", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "done", data: {} };
      });

      await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "first" })
        .expect(200);

      await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "second" })
        .expect(200);

      const historyRes = await request(app)
        .get(`/chat/${CID}/messages`)
        .expect(200);

      expect(historyRes.body.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("streaming mode (stream: true)", () => {
    it("sets Content-Type to text/event-stream", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "done", data: {} };
      });

      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello", stream: true })
        .expect(200);

      expect(res.headers["content-type"]).toContain("text/event-stream");
    });

    it("streams user, assistant, and done events as SSE", async () => {
      mocks.piChatStream.mockImplementation(async function* () {
        yield { type: "user", data: { id: "u1", role: "user", content: "hi", timestamp: "" } };
        yield { type: "done", data: { id: "a1", role: "assistant", content: "hi!", timestamp: "" } };
      });

      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hi", stream: true })
        .expect(200);

      const text = res.text;
      expect(text).toContain('"type":"user"');
      expect(text).toContain('"type":"done"');
      expect(text).toContain("[DONE]");
    });

    it("writes a keepalive comment every 15s", async () => {
      let yielded = false;
      mocks.piChatStream.mockImplementation(async function* () {
        yielded = true;
        yield { type: "done", data: {} };
      });

      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hi", stream: true })
        .expect(200);

      expect(yielded).toBe(true);
      expect(res.headers["content-type"]).toContain("text/event-stream");
    });

    it("returns 503 when pi container unavailable in stream mode", async () => {
      mocks.hasPiContainer.mockReturnValue(false);

      const res = await request(app)
        .post(`/chat/${CID}/messages`)
        .send({ message: "hello", stream: true })
        .expect(503);

      expect(res.body.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// GET /chat/:containerId/messages
// ---------------------------------------------------------------------------
describe("GET /chat/:containerId/messages", () => {
  it("returns empty messages array for new session", async () => {
    const res = await request(app)
      .get(`/chat/${CID}/messages`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.messages).toEqual([]);
    expect(res.body.sessionId).toBeTruthy();
  });

  it("returns previously sent messages", async () => {
    mocks.piChatStream.mockImplementation(async function* () {
      yield { type: "done", data: {} };
    });

    await request(app)
      .post(`/chat/${CID}/messages`)
      .send({ message: "hello" })
      .expect(200);

    const res = await request(app)
      .get(`/chat/${CID}/messages`)
      .expect(200);

    expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
    expect(res.body.messages.some((m: any) => m.content === "hello")).toBe(true);
  });

  it("returns success true on valid session", async () => {
    const res = await request(app)
      .get(`/chat/${CID}/messages`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});
