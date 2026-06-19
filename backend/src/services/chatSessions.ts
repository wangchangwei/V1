// V1 chat session storage. Source of truth for conversation history —
// the pi sidecar receives the full history on each request but does not
// persist it. Tool calls and tool results are recorded by V1 from the
// pi-emitted tool_call / tool_result SSE chunks so the timeline stays
// complete for the edit-and-regenerate flow.

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  snapshotId?: string;
}

export interface Attachment {
  type: "image" | "document";
  data: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: string;
  result: string;
  ok: boolean;
}

export interface ChatSession {
  id: string;
  containerId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// Exported for test isolation only; production code should use
// getOrCreateChatSession / getChatSession / createChatSession.
export const chatSessions = new Map<string, ChatSession>();

export async function createChatSession(
  containerId: string
): Promise<ChatSession> {
  const sessionId = `${containerId}-${Date.now()}`;
  const session: ChatSession = {
    id: sessionId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatSessions.set(sessionId, session);
  return session;
}

export function getChatSession(sessionId: string): ChatSession | undefined {
  return chatSessions.get(sessionId);
}

export function getOrCreateChatSession(containerId: string): ChatSession {
  const existingSession = Array.from(chatSessions.values()).find(
    (session) => session.containerId === containerId
  );

  if (existingSession) {
    return existingSession;
  }

  const sessionId = `${containerId}-${Date.now()}`;
  const session: ChatSession = {
    id: sessionId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatSessions.set(sessionId, session);
  return session;
}

// Convert V1's internal messages to the OpenAI-format pi sidecar expects.
// System prompt injection is left to the pi container (its own auth/config
// picks the model and system context). pi-http-entry accepts both string
// and array content shapes; we pass through attachments as image_url parts
// and decode document attachments as inline text.
export function sessionToPiMessages(
  session: ChatSession
): Array<{ role: "user" | "assistant"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> }> {
  const result: Array<{ role: "user" | "assistant"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> }> = [];
  for (const msg of session.messages) {
    if (msg.role === "user") {
      result.push(buildUserContent(msg.content, msg.attachments));
    } else if (msg.role === "assistant") {
      result.push({ role: "assistant", content: msg.content || "" });
    }
  }
  return result;
}

function buildUserContent(
  message: string,
  attachments?: Attachment[]
): { role: "user"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> } {
  if (!attachments || attachments.length === 0) {
    return { role: "user", content: message };
  }

  const parts: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: message },
  ];
  for (const attachment of attachments) {
    if (attachment.type === "image") {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${attachment.data}`,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      parts.push({
        type: "text",
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }
  return { role: "user", content: parts };
}