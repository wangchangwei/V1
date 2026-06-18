// HTTP client that proxies chat requests to the pi sidecar container.
//
// V1 backend runs on the host; pi sidecar runs inside a Docker container
// exposed at http://127.0.0.1:<hostPort>. The container's port is allocated
// and tracked by piContainerManager (see runningContainers Map).
//
// pi-http-entry.ts (running inside the container) accepts the full
// conversation history and streams back V1-format SSE chunks. This module
// is a pure pass-through — no translation or session state is kept here.
//
// Auth: every request carries an x-pi-secret header validated by the
// container's pi-http-entry. The shared secret is generated/loaded by
// piContainerManager and is the same for every container it spawns in
// this V1 process (see getPiSecret in piContainerManager).

import { runningContainers, getPiSecret } from "./piContainerManager";

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

// Read the shared secret that piContainerManager minted/loaded at process
// start. Exposed for tests; runtime callers go through piChatStream.
export function getPiProxySecret(): string {
  return getPiSecret();
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
  const secret = getPiSecret();

  let response: Response;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) headers["x-pi-secret"] = secret;
    response = await fetch(url, {
      method: "POST",
      headers,
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
