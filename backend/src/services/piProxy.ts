// HTTP client that proxies chat requests to the pi sidecar container.
//
// V1 backend runs on the host; pi sidecar runs inside a Docker container
// exposed at http://127.0.0.1:<hostPort>. The container's port is allocated
// and tracked by piContainerManager (see runningContainers Map).
//
// pi-http-entry.ts (running inside the container) accepts the full
// conversation history and streams back V1-format SSE chunks. This module
// is a pure pass-through — no translation or session state is kept here.

import { runningContainers } from "./piContainerManager.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
}

export interface PiChatChunk {
  type: "user" | "assistant" | "tool_call" | "tool_result" | "done" | "error";
  data: any;
}

export function hasPiContainer(projectId: string): boolean {
  return runningContainers.has(projectId);
}

export function getPiContainerHostPort(projectId: string): number {
  const handle = runningContainers.get(projectId);
  if (!handle) {
    throw new Error(`Pi container not running for project ${projectId}`);
  }
  return handle.hostPort;
}

/**
 * Streams chat completion from the pi sidecar container.
 *
 * @param projectId - V1 project ID; looks up pi container via runningContainers
 * @param messages - Full conversation history (V1 session as source of truth)
 * @param signal - AbortSignal for client disconnect
 * @returns AsyncGenerator of V1-format chunks (already translated by pi-http-entry)
 */
export async function* piChatStream(
  projectId: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<PiChatChunk> {
  const hostPort = getPiContainerHostPort(projectId);
  const url = `http://127.0.0.1:${hostPort}/v1/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, stream: true }),
      signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "error", data: { error: msg } };
    return;
  }

  if (!response.ok) {
    yield { type: "error", data: { error: `pi returned ${response.status}` } };
    return;
  }

  if (!response.body) {
    yield { type: "error", data: { error: "pi returned no body" } };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as PiChatChunk;
          yield chunk;
        } catch {
          // Ignore malformed lines — pi-http-entry should produce valid JSON.
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: "error", data: { error: msg } };
  }
}
