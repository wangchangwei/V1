"use client";

import {
  ChevronLeft,
  Code2,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Home,
  Layers,
  Menu,
  Monitor,
  RefreshCw,
  Smartphone,
  Terminal,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/backend/api";
import { toast } from "react-hot-toast";
import {
  getChatHistory,
  Message,
  sendChatMessage,
  sendChatMessageStream,
} from "../../../lib/backend/api";
import { ChatInput } from "../../create/components/ChatInput";
import { ChatMessage } from "../../create/components/ChatMessage";
import CodeEditor from "../../editor/CodeEditor";
import { LivePreview } from "./LivePreview";

interface WorkspaceDashboardProps {
  containerId: string;
}

export const WorkspaceDashboard = ({
  containerId,
}: WorkspaceDashboardProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"preview" | "editor">("preview");
  const [isDesktopView, setIsDesktopView] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [containerUrl, setContainerUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [hasProcessedPrompt, setHasProcessedPrompt] = useState<boolean>(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(384);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modelFromUrl = urlParams.get("model");
    if (modelFromUrl) setSelectedModel(modelFromUrl);
  }, []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamCancelRef = useRef<(() => void) | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (containerId) {
      const fetchContainerUrl = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/containers`);
          const data = await response.json();
          if (data.success) {
            const container = data.containers.find(
              (c: any) => c.id === containerId
            );
            if (container && container.url) {
              setContainerUrl(container.url);
            }
          }
        } catch (error) {
          console.error("Error fetching container URL:", error);
        }
      };

      fetchContainerUrl();
      const interval = setInterval(fetchContainerUrl, 10000);
      return () => clearInterval(interval);
    }
  }, [containerId]);

  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const response = await getChatHistory(containerId);
        if (response.success) {
          if (response.messages.length === 0 && !hasProcessedPrompt) {
            const urlParams = new URLSearchParams(window.location.search);
            const promptFromUrl = urlParams.get("prompt");

            if (promptFromUrl) {
              setHasProcessedPrompt(true);
              setIsLoading(true);

              const modelFromUrl = urlParams.get("model");

              try {
                const response = await sendChatMessage(
                  containerId,
                  promptFromUrl,
                  [],
                  modelFromUrl ?? undefined
                );
                if (response.success) {
                  setMessages([
                    response.userMessage,
                    response.assistantMessage,
                  ]);
                }
              } catch (error) {
                console.error("Failed to send initial prompt:", error);
                const errorMessage: Message = {
                  id: `error-${Date.now()}`,
                  role: "assistant",
                  content:
                    "Sorry, I encountered an error processing your request. Please try again.",
                  timestamp: new Date().toISOString(),
                };
                setMessages([errorMessage]);
              } finally {
                setIsLoading(false);
              }

              window.history.replaceState(
                {},
                document.title,
                window.location.pathname
              );
            }
          } else {
            setMessages(response.messages);
          }
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    };

    if (containerId) {
      loadChatHistory();
    }
  }, [containerId]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const validateFiles = (files: File[], existingFiles: File[] = []): File[] => {
    const maxFileSize = 5 * 1024 * 1024;
    const maxTotalSize = 20 * 1024 * 1024;

    const existingTotalSize = existingFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );
    let newTotalSize = existingTotalSize;
    const validFiles: File[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isDocument = [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(file.type);

      if (!isImage && !isDocument) {
        toast.error(`${file.name} is not a supported file type`);
        continue;
      }

      if (file.size > maxFileSize) {
        toast.error(`${file.name} is too large (max 5MB per file)`);
        continue;
      }

      if (newTotalSize + file.size > maxTotalSize) {
        toast.error(
          `Cannot add ${file.name}: would exceed total size limit (max 20MB)`
        );
        continue;
      }

      newTotalSize += file.size;
      validFiles.push(file);
    }

    return validFiles;
  };

  const handleSendMessage = async (attachments?: File[]): Promise<void> => {
    const allAttachments = [...(attachments || []), ...pendingFiles];

    if (!inputValue.trim() && allAttachments.length === 0) return;
    if (isLoading) return;

    const totalSize = allAttachments.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
      toast.error("Total file size exceeds 20MB limit");
      return;
    }

    const userInput = inputValue;
    setInputValue("");
    setPendingFiles([]);
    setIsLoading(true);

    streamCancelRef.current?.();

    let attachmentData: any[] = [];
    if (allAttachments.length > 0) {
      try {
        attachmentData = await Promise.all(
          allAttachments.map(async (file) => {
            const base64 = await fileToBase64(file);
            return {
              type: file.type.startsWith("image/") ? "image" : "document",
              data: base64,
              name: file.name,
              mimeType: file.type,
              size: file.size,
            };
          })
        );
      } catch (error) {
        console.error("Error processing files:", error);
        toast.error("Error processing files. Please try again.");
        setIsLoading(false);
        return;
      }
    }

    const cancel = sendChatMessageStream(
      containerId,
      userInput,
      attachmentData,
      (data) => {
        if (data.type === "user") {
          setMessages((prev) => [...prev, data.data]);
        } else if (data.type === "tool_call" || data.type === "tool_result") {
          // No-op: tool calls are shown in the final assistant message
        } else if (data.type === "assistant") {
          setStreamingMessageId(data.data.id);
          setMessages((prev) => {
            const newMessages = [...prev];
            const existingIndex = newMessages.findIndex(
              (msg) => msg.id === data.data.id
            );

            if (existingIndex >= 0) {
              newMessages[existingIndex] = data.data;
            } else {
              newMessages.push(data.data);
            }

            return newMessages;
          });
        } else if (data.type === "done") {
          setStreamingMessageId(null);
        }
      },
      (error) => {
        console.error("Streaming error:", error);
        setIsLoading(false);
        setStreamingMessageId(null);

        if (error.includes("413") || error.includes("Payload Too Large")) {
          toast.error("Files too large. Please reduce file sizes and try again.");
        } else if (error.includes("502")) {
          toast.error("请求超时或网关错误(502)。Cursor CLI 响应较慢时可能触发，请稍候再试；若通过端口转发访问，建议直接打开 localhost。");
        } else {
          toast.error("Connection error. Please try again.");
        }

        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      },
      () => {
        setIsLoading(false);
        setStreamingMessageId(null);
      },
      selectedModel
    );

    streamCancelRef.current = cancel;
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = sidebarRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragOver(false);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = validateFiles(droppedFiles, pendingFiles);

    if (validFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...validFiles]);
      if (validFiles.length === droppedFiles.length) {
        toast.success(`${validFiles.length} file(s) ready to send!`);
      } else {
        toast.success(
          `${validFiles.length} of ${droppedFiles.length} files added`
        );
      }
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRefresh = () => {
    const iframe = document.querySelector("iframe");
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const handleSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 240), 600);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleExternalLink = () => {
    if (containerUrl) {
      window.open(containerUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleExportCode = async () => {
    if (isExporting) return;

    setIsExporting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/containers/${containerId}/export`
      );

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nextjs-project-${containerId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const formatMessageContent = (content: string): React.ReactNode[] => {
    return content.split("\n").map((line: string, index: number) => {
      if (line.startsWith("## ")) {
        return (
          <h3 key={index} className="text-lg font-semibold mt-4 mb-2">
            {line.substring(3)}
          </h3>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h4 key={index} className="text-base font-semibold mt-3 mb-1">
            {line.substring(4)}
          </h4>
        );
      }
      if (line.startsWith("# ")) {
        return (
          <h2 key={index} className="text-xl font-semibold mt-4 mb-2">
            {line.substring(2)}
          </h2>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <li key={index} className="ml-4 list-disc">
            {line.substring(2)}
          </li>
        );
      }
      if (line.match(/^\d+\./)) {
        const match = line.match(/^(\d+\.)\s*(.*)$/);
        return (
          <li key={index} className="ml-4 list-decimal">
            {match ? match[2] : line}
          </li>
        );
      }
      if (line.includes("**") && line.includes("**")) {
        const parts = line.split("**");
        return (
          <p key={index} className="mb-2">
            {parts.map((part: string, i: number) =>
              i % 2 === 1 ? <strong key={i}>{part}</strong> : part
            )}
          </p>
        );
      }
      if (line.includes("`") && line.includes("`")) {
        const parts = line.split("`");
        return (
          <p key={index} className="mb-2">
            {parts.map((part: string, i: number) =>
              i % 2 === 1 ? (
                <code
                  key={i}
                  className="bg-gray-700 px-1 py-0.5 rounded text-sm font-mono"
                >
                  {part}
                </code>
              ) : (
                part
              )
            )}
          </p>
        );
      }
      return line ? (
        <p key={index} className="mb-2">
          {line}
        </p>
      ) : (
        <br key={index} />
      );
    });
  };

  const WelcomeMessage = () => (
    <div className="flex flex-col items-start mb-4">
      <div className="flex items-center gap-2 mb-2">
        <img
          className="w-4 h-4 rounded"
          src="/december-logo.png"
          alt="Assistant Avatar"
        />
        <span className="text-sm font-medium text-white/90">Assistant</span>
      </div>
      <div className="rounded-xl px-4 py-3 text-sm leading-relaxed bg-gray-700/60 backdrop-blur-md border border-gray-600/40 text-gray-100 w-full shadow-sm relative">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-600/10 via-transparent to-gray-700/10 rounded-xl" />
        <div className="relative z-10">
          <div className="prose prose-sm prose-invert max-w-none [&_h2]:text-white [&_h3]:text-white [&_h4]:text-white [&_strong]:text-white">
            <p className="mb-2">
              👋 Welcome to your Next.js project! I'm here to help you build,
              modify, and deploy your application.
            </p>
            <p className="mb-2">I can help you with:</p>
            <ul className="list-disc ml-4 mb-2">
              <li>Adding new features and components</li>
              <li>Modifying existing code</li>
              <li>Installing packages and dependencies</li>
              <li>Debugging and troubleshooting</li>
              <li>Optimizing performance</li>
            </ul>
            <p className="mb-0">
              Just describe what you'd like to build or change, and I'll help
              you make it happen! 🚀
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-black text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/50 via-black to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />

      <div className="flex flex-col w-full relative z-10">
        <div className="h-14 bg-black/70 backdrop-blur-xl border-b border-gray-800/50 flex items-center justify-between px-4 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-700/5 via-transparent to-gray-700/5" />

          <div className="flex items-center gap-3 relative z-10">
            <Link
              href="/"
              className="flex items-center gap-3 text-white/90 hover:text-white transition-colors group"
            >
              <span
                className="text-lg bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
                style={{ fontFamily: "XSpace, monospace" }}
              >
                changwei
              </span>
            </Link>

            <div className="h-6 w-px bg-gray-700/50 mx-2" />

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors group"
            >
              <div className="w-7 h-7 bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-lg flex items-center justify-center group-hover:bg-gray-700/60 group-hover:border-gray-600/50 transition-all shadow-sm">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-sm font-medium">
                  {containerId.slice(0, 8)}
                </span>
                <span className="text-xs text-white/50">Next.js Project</span>
              </div>
              {sidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm text-white/60 relative z-10">
            <Link
              href="/"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Projects</span>
            </Link>
            <span>/</span>
            <span className="text-white font-medium">
              {containerId.slice(0, 8)}
            </span>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            {viewMode === "preview" && (
              <button
                onClick={() => setIsDesktopView(!isDesktopView)}
                className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded-md transition-all backdrop-blur-sm"
                title={
                  isDesktopView
                    ? "Switch to mobile view"
                    : "Switch to desktop view"
                }
              >
                {isDesktopView ? (
                  <Monitor className="w-4 h-4" />
                ) : (
                  <Smartphone className="w-4 h-4" />
                )}
              </button>
            )}

            <div className="flex items-center gap-0.5 bg-gray-800/40 backdrop-blur-md rounded-lg p-0.5 border border-gray-700/40">
              <button
                onClick={() => setViewMode("preview")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "preview"
                    ? "bg-white/10 text-white shadow-sm backdrop-blur-sm"
                    : "text-white/60 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={() => setViewMode("editor")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "editor"
                    ? "bg-white/10 text-white shadow-sm backdrop-blur-sm"
                    : "text-white/60 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Code
              </button>
            </div>

            <div className="h-4 w-px bg-gray-700/40 mx-1" />

            <button
              onClick={handleRefresh}
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded-md transition-all backdrop-blur-sm"
              disabled={!containerUrl}
              title="Refresh preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleExternalLink}
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded-md transition-all backdrop-blur-sm"
              disabled={!containerUrl}
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-gray-700/40 mx-1" />

            <button
              onClick={handleExportCode}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800/40 hover:bg-gray-700/50 disabled:bg-gray-800/20 text-white/90 hover:text-white disabled:text-white/50 rounded-md text-xs font-medium transition-all border border-gray-700/40 hover:border-gray-600/50 backdrop-blur-md shadow-sm"
              title="Export project as ZIP"
            >
              {isExporting ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white/90 rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={() =>
                toast("This feature is coming soon!", {
                  icon: "🙌",
                  duration: 1000,
                })
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-black hover:bg-gray-100 rounded-md text-xs font-medium transition-all shadow-sm hover:shadow-lg"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Deploy</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <div
              ref={sidebarRef}
              style={{ width: sidebarWidth }}
              className="bg-black/60 backdrop-blur-xl border-r border-gray-800/50 flex flex-col relative shrink-0"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-gray-700/10 via-gray-800/5 to-gray-700/10" />
              {/* Resize handle */}
              <div
                onMouseDown={handleSidebarResize}
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-20 transition-colors"
                title="Drag to resize"
              />

              {isDragOver && (
                <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm border-2 border-dashed border-blue-400/60 rounded-lg z-50 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
                      <Upload className="w-8 h-8 text-blue-400" />
                    </div>
                    <div className="text-lg font-medium text-white mb-2">
                      Drop files here
                    </div>
                    <div className="text-sm text-blue-200">
                      Images, PDFs, and documents supported
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 h-12 px-4 border-b border-gray-800/30 relative z-10">
                <Terminal className="w-4 h-4 text-white/70" />
                <span className="text-sm font-medium text-white/90">
                  AI Assistant
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative z-10">
                <div className="space-y-4">
                  {messages.length === 0 && <WelcomeMessage />}

                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      formatMessageContent={formatMessageContent}
                      containerId={containerId}
                      isStreaming={streamingMessageId === message.id}
                    />
                  ))}
                  {isLoading && !streamingMessageId && (
                    <div className="flex items-start">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-4 h-4 bg-gradient-to-br from-blue-500 to-purple-500 rounded" />
                        <span className="text-sm font-medium">Assistant</span>
                      </div>
                      <div className="max-w-[80%] rounded-xl px-3 py-3 text-sm leading-relaxed bg-gray-800/60 backdrop-blur-md text-gray-100 ml-2 border border-gray-700/40 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-gray-800/30 relative z-10">
                <ChatInput
                  inputValue={inputValue}
                  setInputValue={setInputValue}
                  onSendMessage={handleSendMessage}
                  textareaRef={textareaRef}
                  onKeyDown={handleTextareaKeyDown}
                  disabled={isLoading}
                  pendingFiles={pendingFiles}
                  onRemovePendingFile={removePendingFile}
                />
              </div>
            </div>
          )}

          <div className="flex-1 bg-black relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_rgba(148,163,184,0.15)_1px,_transparent_0)] bg-[length:32px_32px] opacity-5" />

            {viewMode === "preview" ? (
              <div className="h-full p-6 relative z-10">
                <div className="h-full bg-gray-900/40 backdrop-blur-sm rounded-xl border border-gray-800/40 overflow-hidden shadow-2xl shadow-black/20">
                  <LivePreview
                    containerId={containerId}
                    isDesktopView={isDesktopView}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full relative z-10">
                <CodeEditor containerId={containerId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
