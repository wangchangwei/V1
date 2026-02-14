import OpenAI from "openai";
import { config } from "../../config";
import prompt from "../utils/prompt.txt";
import * as fileService from "./file";
import { callCursorCli } from "./cursorCli";

const openai =
  config.aiSdk.provider === "openai"
    ? new OpenAI({
        apiKey: config.aiSdk.apiKey,
        baseURL: config.aiSdk.baseUrl || "https://api.openai.com/v1",
      })
    : null;

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

export async function sendMessage(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = []
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

  const fileContentTree = await fileService.getFileContentTree(containerId);

  const codeContext = JSON.stringify(fileContentTree, null, 2);

  const systemPrompt = `${prompt}

Current codebase structure and content:
${codeContext}`;

  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...session.messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content:
        msg.role === "user" && msg.attachments
          ? buildMessageContent(msg.content, msg.attachments)
          : msg.content,
    })),
  ];

  let assistantContent: string;

  if (config.aiSdk.provider === "cursor") {
    const cursorMessages = openaiMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: Array.isArray(m.content) ? m.content.map((c: any) => (c.text ?? c)).join("\n") : (m.content as string),
    }));
    assistantContent = await callCursorCli(systemPrompt, cursorMessages);
  } else if (openai) {
    const completion = await openai.chat.completions.create({
      model: config.aiSdk.model,
      messages: openaiMessages,
      //@ts-ignore
      temperature: config.aiSdk.temperature,
    });
    assistantContent =
      completion.choices[0]?.message?.content ||
      "Sorry, I could not generate a response.";
  } else {
    assistantContent = "AI provider not configured.";
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
  attachments: Attachment[] = []
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

  const fileContentTree = await fileService.getFileContentTree(containerId);

  const codeContext = JSON.stringify(fileContentTree, null, 2);

  const systemPrompt = `${prompt}

Current codebase structure and content:
${codeContext}`;

  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
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

  if (config.aiSdk.provider === "cursor") {
    const cursorMessages = openaiMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: Array.isArray(m.content) ? m.content.map((c: any) => (c.text ?? c)).join("\n") : (m.content as string),
    }));
    assistantContent = await callCursorCli(systemPrompt, cursorMessages);
    yield {
      type: "assistant",
      data: {
        id: assistantId,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      },
    };
  } else if (openai) {
    const stream = await openai.chat.completions.create({
      model: config.aiSdk.model,
      messages: openaiMessages,
      //@ts-ignore
      temperature: config.aiSdk.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        assistantContent += delta.content;
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
    }
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
