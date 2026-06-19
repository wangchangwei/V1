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
