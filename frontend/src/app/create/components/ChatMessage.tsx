import {
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Code,
  File,
  FileText,
  FolderOpen,
  Image,
  Package,
  Pencil,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  onEdit?: (newContent: string) => void;
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
        <div className="border-t border-white/10 px-3 py-2 bg-black/20 space-y-2">
          {(() => {
            const parsed = safeParseArgs(toolCall.args);
            // write_file: show the file content (the actual code change) above
            // the result so users can see what was written without digging.
            if (
              toolCall.name === "write_file" &&
              typeof parsed.content === "string"
            ) {
              return (
                <>
                  <div>
                    <div className="text-xs text-white/50 mb-1">
                      Content
                    </div>
                    <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                      {parsed.content}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs text-white/50 mb-1">Result</div>
                    <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                      {toolCall.result || "(empty)"}
                    </pre>
                  </div>
                </>
              );
            }
            // list_files: result is JSON, render compactly
            if (toolCall.name === "list_files") {
              return (
                <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                  {toolCall.result || "(empty)"}
                </pre>
              );
            }
            // default: just show the result
            return (
              <pre className="text-xs text-white/80 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                {toolCall.result || "(empty)"}
              </pre>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const CollapsibleCode: React.FC<{
  code: string;
  language?: string;
  label?: string;
}> = ({ code, language, label: customLabel }) => {
  const [expanded, setExpanded] = useState(false);
  const label = customLabel ?? (language ? `Code (${language})` : "Code Block");
  return (
    <div className="my-3 bg-gray-500/10 border border-gray-500/30 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 bg-gray-500/20 px-3 py-2 border-b border-gray-500/30 hover:bg-gray-500/30 transition-colors text-left"
      >
        <Code className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-400">{label}</span>
        <span className="ml-auto text-xs text-white/50">
          {expanded ? "▲ 收起" : "▼ 展开"}
        </span>
      </button>
      {expanded && (
        <div className="p-3">
          <pre className="bg-gray-800/60 rounded p-3 text-xs overflow-x-auto">
            <code className="text-gray-300">{code.trim()}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

// Split content by fenced code blocks (```lang\n...\n```); returns alternating
// text and code segments so code blocks can be rendered as CollapsibleCode while
// the rest of the message keeps its normal markdown rendering.
//
// Also handles legacy <dec-code>...</dec-code> and
// <dec-write file_path="...">...</dec-write> tags from messages produced
// before the OpenAI tool-use refactor.
function splitByCodeBlocks(
  content: string
): Array<{ type: "text" | "code"; content: string; language?: string; label?: string }> {
  const segments: Array<{ type: "text" | "code"; content: string; language?: string; label?: string }> = [];
  // Match fenced code, dec-code, or dec-write in one pass.
  const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```|<dec-code>([\s\S]*?)<\/dec-code>|<dec-write\s+file_path="([^"]+)">([\s\S]*?)<\/dec-write>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    if (match[0].startsWith("```")) {
      segments.push({
        type: "code",
        content: match[2],
        language: match[1] || undefined,
      });
    } else if (match[0].startsWith("<dec-code>")) {
      segments.push({ type: "code", content: match[3] });
    } else if (match[0].startsWith("<dec-write")) {
      segments.push({
        type: "code",
        content: match[5],
        label: `Create/Update ${match[4]}`,
      });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }
  return segments;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, formatMessageContent, onEdit }) => {
  const toolCalls = message.toolCalls ?? [];
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

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
            src="/v1-logo.png"
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
            <div className="group relative">
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    aria-label="Edit message"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full rounded border border-gray-600 bg-gray-800 p-2 text-sm text-white"
                    rows={Math.max(2, draft.split("\n").length)}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setDraft(message.content);
                      }}
                      className="rounded bg-gray-700 px-3 py-1 text-sm text-white hover:bg-gray-600"
                    >
                      <X size={14} className="inline" /> Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        onEdit?.(draft);
                      }}
                      className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500"
                    >
                      <Check size={14} className="inline" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {onEdit && (
                    <button
                      type="button"
                      aria-label="Edit message"
                      onClick={() => {
                        setDraft(message.content);
                        setIsEditing(true);
                      }}
                      className="absolute -right-2 -top-2 hidden rounded bg-gray-700 p-1 text-white opacity-0 transition-opacity group-hover:block group-hover:opacity-100 hover:bg-gray-600"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
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
                <div className="chat-markdown max-w-none">
                  {splitByCodeBlocks(message.content).map((seg, i) =>
                    seg.type === "code" ? (
                      <CollapsibleCode
                        key={i}
                        code={seg.content}
                        language={seg.language}
                        label={seg.label}
                      />
                    ) : (
                      <ReactMarkdown
                        key={i}
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Inline code only — fenced code blocks have been
                          // extracted by splitByCodeBlocks and rendered above.
                          code({ className, children, ...rest }) {
                            const isInline = !(rest as any).node?.position;
                            if (isInline) {
                              return (
                                <code className="chat-inline-code">
                                  {children}
                                </code>
                              );
                            }
                            return <code className={className}>{children}</code>;
                          },
                        }}
                      >
                        {seg.content}
                      </ReactMarkdown>
                    )
                  )}
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
