import { config } from "../../config";
import prompt from "../utils/prompt.txt";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: "image" | "document";
  data: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatSession {
  id: string;
  containerId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const chatSessions = new Map<string, ChatSession>();

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

function buildMessageContent(
  message: string,
  attachments: Attachment[] = []
): any[] {
  const content: any[] = [{ type: "text", text: message }];

  for (const attachment of attachments) {
    if (attachment.type === "image") {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${attachment.data}`,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      content.push({
        type: "text",
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }

  return content;
}

// Detect whether base URL is Anthropic-compatible (MiniMax, Anthropic, etc.)
// These providers use the /v1/messages endpoint instead of /v1/chat/completions
function isAnthropicEndpoint(baseUrl: string): boolean {
  const url = baseUrl.toLowerCase();
  return (
    url.includes("minimaxi") ||
    url.includes("minimax") ||
    url.includes("anthropic")
  );
}

// Call Anthropic-compatible /v1/messages endpoint via native fetch
async function anthropicChatComplete(
  model: string,
  systemPrompt: string,
  messages: any[],
  temperature: number,
  stream: boolean
): Promise<{ content: string; stream: AsyncGenerator<string> }> {
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const text =
        typeof m.content === "string" ? m.content : m.content?.map?.((c: any) => c.text ?? "").join("") ?? "";
      return { role: m.role as "user" | "assistant", content: text };
    });

  const body: Record<string, any> = {
    model,
    messages: [{ role: "user", content: systemPrompt }, ...anthropicMessages],
    max_tokens: 8192,
    stream,
  };

  if (temperature !== undefined) {
    body.temperature = temperature;
  }

  const response = await fetch(`${config.aiSdk.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiSdk.apiKey}`,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorBody}`);
  }

  if (stream) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    async function* gen(): AsyncGenerator<string> {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") return;
            try {
              const json = JSON.parse(data);
              const text = json.delta?.text ?? json.content?.[0]?.text ?? "";
              if (text) yield text;
            } catch {}
          }
        }
      }
    }

    return { content: "", stream: gen() };
  } else {
    const data = await response.json();
    const content =
      data.content?.[0]?.text ?? data.choices?.[0]?.message?.content ?? "";
    return { content, stream: null as any };
  }
}

// Call standard OpenAI-compatible /v1/chat/completions endpoint via native fetch
async function openaiChatComplete(
  model: string,
  messages: any[],
  temperature: number,
  stream: boolean
): Promise<{ content: string; stream: AsyncGenerator<string> }> {
  const response = await fetch(`${config.aiSdk.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiSdk.apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature, stream }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorBody}`);
  }

  if (stream) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    async function* gen(): AsyncGenerator<string> {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") return;
            try {
              const json = JSON.parse(data);
              const text = json.choices?.[0]?.delta?.content ?? "";
              if (text) yield text;
            } catch {}
          }
        }
      }
    }

    return { content: "", stream: gen() };
  } else {
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return { content, stream: null as any };
  }
}

export async function sendMessage(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = [],
  model?: string
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  session.messages.push(userMsg);

  const openaiMessages = [
    { role: "system" as const, content: prompt },
    ...session.messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content:
        msg.role === "user" && msg.attachments
          ? buildMessageContent(msg.content, msg.attachments)
          : msg.content,
    })),
  ];

  let assistantContent: string;

  const resolvedModel = model ?? config.aiSdk.model;

  if (isAnthropicEndpoint(config.aiSdk.baseUrl)) {
    const result = await anthropicChatComplete(
      resolvedModel,
      prompt,
      openaiMessages,
      config.aiSdk.temperature,
      false
    );
    assistantContent = result.content;
  } else {
    const result = await openaiChatComplete(
      resolvedModel,
      openaiMessages,
      config.aiSdk.temperature,
      false
    );
    assistantContent = result.content;
  }

  if (!assistantContent) {
    assistantContent = "Sorry, I could not generate a response.";
  }

  const assistantMsg: Message = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  session.messages.push(assistantMsg);
  session.updatedAt = new Date().toISOString();

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
  };
}

export async function* sendMessageStream(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = [],
  model?: string
): AsyncGenerator<{ type: "user" | "assistant" | "done"; data: any }> {
  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  session.messages.push(userMsg);
  yield { type: "user", data: userMsg };

  const openaiMessages = [
    { role: "system" as const, content: prompt },
    ...session.messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content:
        msg.role === "user" && msg.attachments
          ? buildMessageContent(msg.content, msg.attachments)
          : msg.content,
    })),
  ];

  const assistantId = `assistant-${Date.now()}`;
  let assistantContent = "";

  const resolvedModel = model ?? config.aiSdk.model;

  let chunks: AsyncGenerator<string>;
  if (isAnthropicEndpoint(config.aiSdk.baseUrl)) {
    const result = await anthropicChatComplete(
      resolvedModel,
      prompt,
      openaiMessages,
      config.aiSdk.temperature,
      true
    );
    chunks = result.stream;
  } else {
    const result = await openaiChatComplete(
      resolvedModel,
      openaiMessages,
      config.aiSdk.temperature,
      true
    );
    chunks = result.stream;
  }

  for await (const chunk of chunks) {
    assistantContent += chunk;
    yield {
      type: "assistant",
      data: {
        id: assistantId,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const finalAssistantMsg: Message = {
    id: assistantId,
    role: "assistant",
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  session.messages.push(finalAssistantMsg);
  session.updatedAt = new Date().toISOString();

  yield { type: "done", data: finalAssistantMsg };
}
