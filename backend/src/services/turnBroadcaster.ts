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
  end: () => void;
}

type FinalChunk =
  | { type: "done"; data: { id: string } }
  | { type: "error"; data: { error: string } };

function safeWrite(res: SubscriberRes, chunk: any): void {
  try {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  } catch {
    // Ignore write failures during initial flush; the subscriber's first
    // read loop will hit onerror and detach.
  }
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
    this.subscribers.add(res);

    // Replay enough state for the new subscriber to render the same view as
    // long-running clients. Order: user message → current assistant snapshot
    // (carrying partialText + toolCalls) → individual tool_call/tool_result
    // chunks (so the chat page's tool-call reducer path also runs) → final
    // chunk (if the turn has already finished).
    const { userMsg, assistantMsgId, partialText, toolCalls } = this.state;

    safeWrite(res, { type: "user", data: userMsg });

    if (partialText || toolCalls.length > 0) {
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
    }

    for (const tc of toolCalls) {
      safeWrite(res, { type: "tool_call", data: { id: tc.id, name: tc.name, args: tc.args } });
      safeWrite(res, {
        type: "tool_result",
        data: { id: tc.id, ok: tc.ok, result: tc.result },
      });
    }

    // If the turn has already finalized, also replay the final chunk so the
    // late subscriber sees the terminal state.
    if (this.state.status !== "running") {
      safeWrite(res, this.buildFinalChunk());
    }
  }

  detach(res: SubscriberRes): void {
    this.subscribers.delete(res);
  }

  // emit / finalize are implemented in Tasks 2 and 4.
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

  finalize(status: "done" | "error", error?: { message: string }): void {
    if (this.state.status !== "running") return; // idempotent

    this.state.status = status;
    this.state.finishedAt = new Date().toISOString();
    if (error) this.state.error = error;

    // Push the final chunk to all subscribers.
    const finalChunk = this.buildFinalChunk();

    for (const res of this.subscribers) {
      safeWrite(res, finalChunk);
      res.end();
    }

    // Notify caller (registry) so it can remove us.
    this.onFinalize();
  }

  private buildFinalChunk(): FinalChunk {
    if (this.state.status === "done") {
      return { type: "done", data: { id: this.state.assistantMsgId } };
    }
    const message = this.state.error?.message ?? "turn failed";
    return { type: "error", data: { error: message } };
  }

  getState(): BroadcasterState {
    return this.state;
  }

  abort(): void {
    this.finalize("error", { message: "aborted" });
  }
}

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
