import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Code,
  File,
  FileText,
  FolderOpen,
  Image,
  Package,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";

interface Attachment {
  type: "image" | "document";
  data: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result: string;
  ok: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
}

interface ChatMessageProps {
  message: Message;
  formatMessageContent?: (content: string) => React.ReactNode[];
  containerId?: string;
  isStreaming?: boolean;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  read_file: File,
  write_file: File,
  delete_file: Trash2,
  rename_file: File,
  list_files: FolderOpen,
  add_dependency: Package,
};

const TOOL_LABELS: Record<string, string> = {
  read_file: "Read file",
  write_file: "Update file",
  delete_file: "Delete file",
  rename_file: "Rename file",
  list_files: "List files",
  add_dependency: "Install dependency",
};

function safeParseArgs(args: string): Record<string, any> {
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

function getToolSubtitle(name: string, args: string): string {
  const a = safeParseArgs(args);
  if (name === "read_file" || name === "write_file" || name === "delete_file") {
    return a.file_path ?? "";
  }
  if (name === "rename_file") {
    return `${a.old_path ?? "?"} → ${a.new_path ?? "?"}`;
  }
  if (name === "list_files") {
    return a.directory ?? "src";
  }
  if (name === "add_dependency") {
    return a.package_name ?? "";
  }
  return "";
}

const ToolCallRow: React.FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[toolCall.name] ?? Wrench;
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name;
  const subtitle = getToolSubtitle(toolCall.name, toolCall.args);

  return (
    <div
      className={`my-2 border rounded-lg overflow-hidden ${
        toolCall.ok
          ? "bg-blue-500/5 border-blue-500/30"
          : "bg-red-500/10 border-red-500/30"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-white/60" />
        ) : (
          <ChevronRight className="w-3 h-3 text-white/60" />
        )}
        <Icon className={`w-3.5 h-3.5 ${toolCall.ok ? "text-blue-400" : "text-red-400"}`} />
        <span className={`text-xs font-medium ${toolCall.ok ? "text-blue-300" : "text-red-300"}`}>
          {label}
        </span>
        {subtitle && (
          <code className="text-xs text-white/60 font-mono truncate">
            {subtitle}
          </code>
        )}
        <span className="ml-auto text-xs text-white/50">
          {toolCall.ok ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-3 py-2 bg-black/20">
          <div className="text-xs text-white/50 mb-1">Result</div>
          <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
            {toolCall.result || "(empty)"}
          </pre>
        </div>
      )}
    </div>
  );
};

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const toolCalls = message.toolCalls ?? [];

  return (
    <div
      className={`flex flex-col ${
        message.role === "user" ? "items-end" : "items-start"
      }`}
    >
      {message.role === "assistant" && (
        <div className="flex items-center gap-2 mb-2 w-full">
          <img
            className="w-4 h-4 rounded"
            src="/december-logo.png"
            alt="Assistant Avatar"
          />
          <span className="text-sm font-medium text-white/90">Assistant</span>
          <span className="text-xs text-white/40 ml-auto">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      )}

      <div
        className={`rounded-xl px-4 py-3 text-sm leading-relaxed backdrop-blur-md border shadow-sm relative ${
          message.role === "user"
            ? "bg-blue-600/20 border-blue-500/30 text-white ml-8 max-w-[85%]"
            : "bg-gray-700/60 border-gray-600/40 text-gray-100 w-full"
        }`}
      >
        {message.role === "assistant" && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-600/10 via-transparent to-gray-700/10 rounded-xl" />
        )}
        {message.role === "user" && (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-blue-600/10 rounded-xl" />
        )}

        <div className="relative z-10">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {message.attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 border border-white/10"
                >
                  {attachment.type === "image" ? (
                    <>
                      <Image className="w-4 h-4 text-green-400" />
                      <img
                        src={`data:${attachment.mimeType};base64,${attachment.data}`}
                        alt={attachment.name}
                        className="max-w-32 max-h-20 rounded object-cover"
                      />
                    </>
                  ) : (
                    <FileText className="w-4 h-4 text-blue-400" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-medium truncate max-w-24">
                      {attachment.name}
                    </span>
                    <span className="text-xs text-white/60">
                      {formatFileSize(attachment.size)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {message.role === "user" ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="space-y-2">
              {toolCalls.length > 0 && (
                <div>
                  {toolCalls.map((tc) => (
                    <ToolCallRow key={tc.id} toolCall={tc} />
                  ))}
                </div>
              )}
              {message.content && (
                <div className="prose prose-sm prose-invert max-w-none [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_strong]:text-white [&_code]:bg-gray-600/60 [&_code]:text-gray-200 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:border [&_code]:border-gray-500/30 whitespace-pre-wrap">
                  {message.content}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {message.role === "user" && (
        <span className="text-xs text-white/40 mt-1.5 mr-2">
          {formatTimestamp(message.timestamp)}
        </span>
      )}
    </div>
  );
};
