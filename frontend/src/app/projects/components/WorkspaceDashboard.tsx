"use client";

import {
  ChevronLeft,
  Code2,
  Download,
  ExternalLink,
  Eye,
  Globe,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Home,
  Layers,
  Settings,
  Menu,
  Monitor,
  RefreshCw,
  Smartphone,
  Terminal,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/backend/api";
import { toast } from "react-hot-toast";
import {
  deployToVercel,
  getChatHistory,
  getProjectModel,
  getProjectGithub,
  getTurnStatus,
  Message,
  sendChatMessage,
  subscribeTurnStream,
  setProjectModel,
  type ModelInfo,
  pushToGitHub,
  gitCommit,
} from "../../../lib/backend/api";
import { ChatInput } from "../../create/components/ChatInput";
import { ChatMessage } from "../../create/components/ChatMessage";
import CodeEditor from "../../editor/CodeEditor";
import { LivePreview } from "./LivePreview";
import { ModelSelect } from "./ModelSelect";

interface WorkspaceDashboardProps {
  containerId: string;
}

export const WorkspaceDashboard = ({
  containerId,
}: WorkspaceDashboardProps) => {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"preview" | "editor">("preview");
  const [isDesktopView, setIsDesktopView] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [containerUrl, setContainerUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployToken, setDeployToken] = useState<string>("");
  const [showDeployModal, setShowDeployModal] = useState<boolean>(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [showGitModal, setShowGitModal] = useState<boolean>(false);
  const [gitAction, setGitAction] = useState<"commit" | "push" | "pull">("commit");
  const [gitMessage, setGitMessage] = useState<string>("");
  const [gitToken, setGitToken] = useState<string>("");
  const [showGitToken, setShowGitToken] = useState<boolean>(false);
  const [isGitLoading, setIsGitLoading] = useState<boolean>(false);
  const [githubRepo, setGithubRepo] = useState<string>("");
  const [githubBranch, setGithubBranch] = useState<string>("main");
  const [hasProcessedPrompt, setHasProcessedPrompt] = useState<boolean>(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number | string>("50%");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamCancelRef = useRef<(() => void) | null>(null);
  const editCancelRef = useRef<(() => void) | null>(null);
  // Synchronous mirror of streamingMessageId so tool_call/tool_result chunks
  // (which arrive inside the same SSE callback) can attach to the current
  // assistant message without waiting for the next render.
  const streamingMessageIdRef = useRef<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  // Per-project model. Loaded from the backend on mount; updated optimistically
  // when the user picks a new one, then confirmed by the server response.
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  // Cancel any in-flight streams on unmount.
  useEffect(() => {
    return () => {
      editCancelRef.current?.();
      streamCancelRef.current?.();
    };
  }, []);

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
              // Replace 127.0.0.1 with current host so LAN access works
              const url = container.url.replace(
                "http://127.0.0.1:",
                `${window.location.protocol}//${window.location.hostname}:`
              );
              setContainerUrl(url);
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

              try {
                const response = await sendChatMessage(
                  containerId,
                  promptFromUrl,
                  []
                );
                if (response.success) {
                  // POST /messages is JSON-only — by the time it returns,
                  // the assistant's full response is already persisted. Pull
                  // the complete transcript so the user sees their message
                  // followed by the AI's reply (no SSE needed for this path).
                  const history = await getChatHistory(containerId);
                  if (history.success) {
                    setMessages(history.messages);
                  } else {
                    setMessages([response.userMessage]);
                  }
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

            // If a turn was in-flight when the page loaded (e.g. user refreshed
            // mid-stream), rehydrate the partial response so the chat keeps
            // showing "pi is working…" plus whatever text/tool calls have
            // landed so far. Without this, reload mid-stream silently drops
            // the response until the next user message.
            try {
              const status = await getTurnStatus(containerId);
              if (status.processing && status.inProgressTurn) {
                const turn = status.inProgressTurn;
                const partialAssistant: Message = {
                  id: turn.assistantMsgId,
                  role: "assistant",
                  content: turn.partialText,
                  timestamp: turn.startedAt,
                  toolCalls: turn.toolCalls,
                };
                setMessages((prev) => {
                  if (prev.some((m) => m.id === partialAssistant.id)) {
                    return prev;
                  }
                  return [...prev, partialAssistant];
                });
                setStreamingMessageId(partialAssistant.id);
                streamingMessageIdRef.current = partialAssistant.id;
                setIsLoading(true);

                // Subscribe so we keep receiving subsequent chunks after page reload.
                const cancel = subscribeTurnStream(
                  containerId,
                  (data) => {
                    if (data.type === "assistant") {
                      setMessages((prev) => {
                        const newMessages = [...prev];
                        const idx = newMessages.findIndex(
                          (m) => m.id === data.data.id
                        );
                        if (idx < 0) return prev;
                        const existing = newMessages[idx]!;
                        newMessages[idx] = {
                          ...data.data,
                          toolCalls: data.data.toolCalls ?? existing.toolCalls,
                        };
                        return newMessages;
                      });
                    } else if (data.type === "tool_call") {
                      const targetId = streamingMessageIdRef.current;
                      if (!targetId) return;
                      setMessages((prev) => {
                        const newMessages = [...prev];
                        const idx = newMessages.findIndex(
                          (m) => m.id === targetId
                        );
                        if (idx < 0) return prev;
                        const msg = newMessages[idx]!;
                        const toolCalls = msg.toolCalls ?? [];
                        newMessages[idx] = {
                          ...msg,
                          toolCalls: [
                            ...toolCalls,
                            {
                              id: data.data.id,
                              name: data.data.name,
                              args:
                                typeof data.data.args === "string"
                                  ? data.data.args
                                  : JSON.stringify(data.data.args ?? ""),
                              result: "",
                              ok: true,
                            },
                          ],
                        };
                        return newMessages;
                      });
                    } else if (data.type === "tool_result") {
                      const targetId = streamingMessageIdRef.current;
                      if (!targetId) return;
                      setMessages((prev) => {
                        const newMessages = [...prev];
                        const idx = newMessages.findIndex(
                          (m) => m.id === targetId
                        );
                        if (idx < 0) return prev;
                        const msg = newMessages[idx]!;
                        const toolCalls = msg.toolCalls ?? [];
                        newMessages[idx] = {
                          ...msg,
                          toolCalls: toolCalls.map((tc) =>
                            tc.id === data.data.id
                              ? {
                                  ...tc,
                                  ok: !!data.data.ok,
                                  result:
                                    typeof data.data.result === "string"
                                      ? data.data.result
                                      : JSON.stringify(data.data.result ?? ""),
                                }
                              : tc
                          ),
                        };
                        return newMessages;
                      });
                    }
                  },
                  (error) => {
                    console.error("Subscription error during recovery:", error);
                  },
                  () => {
                    setIsLoading(false);
                    setStreamingMessageId(null);
                    streamingMessageIdRef.current = null;
                  }
                );
                streamCancelRef.current = cancel;
              }
            } catch (err) {
              console.error("Failed to load turn status:", err);
            }
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

  // Load per-project model + available list once. The dropdown is rendered
  // even before this resolves (with `currentModel=null` it just shows the
  // chevron and a placeholder), so this is best-effort.
  useEffect(() => {
    if (!containerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { current, available } = await getProjectModel(containerId);
        if (cancelled) return;
        setAvailableModels(available);
        setCurrentModel(current);
      } catch (err) {
        console.error("Failed to load model config:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [containerId]);

  // Load GitHub connection status on mount.
  useEffect(() => {
    if (!containerId) return;
    (async () => {
      try {
        const res = await getProjectGithub(containerId);
        if (res.success && res.repo) {
          setGithubRepo(res.repo);
          setGithubBranch(res.branch || "main");
        }
      } catch (err) {
        console.error("Failed to load GitHub config:", err);
      }
    })();
  }, [containerId]);

  const handleModelChange = async (newModel: string): Promise<void> => {
    if (newModel === currentModel) return;
    const previous = currentModel;
    setCurrentModel(newModel); // optimistic
    try {
      const confirmed = await setProjectModel(containerId, newModel);
      setCurrentModel(confirmed);
      const label =
        availableModels.find((m) => m.id === confirmed)?.displayName ?? confirmed;
      toast.success(`Model set to ${label}. Applies to your next message.`);
    } catch (err) {
      setCurrentModel(previous); // revert
      const msg = err instanceof Error ? err.message : "Failed to switch model";
      toast.error(msg);
    }
  };

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

    // Cancel any previous in-flight subscription.
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

    // Phase 1: synchronously start the turn.
    let response: { success: boolean; userMessage: Message; assistantMessageId: string };
    try {
      response = await sendChatMessage(containerId, userInput, attachmentData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      if (/409|turn_in_progress/.test(msg)) {
        toast.error("A response is already in progress. Wait for it to finish.");
      } else {
        toast.error(msg);
      }
      setIsLoading(false);
      return;
    }

    if (!response.success) {
      toast.error("Failed to send message");
      setIsLoading(false);
      return;
    }

    // Optimistically add the user message and an empty assistant placeholder.
    setMessages((prev) => [...prev, response.userMessage]);
    setStreamingMessageId(response.assistantMessageId);
    streamingMessageIdRef.current = response.assistantMessageId;

    // Phase 2: subscribe to the turn's chunk stream.
    const cancel = subscribeTurnStream(
      containerId,
      (data) => {
        if (data.type === "user") {
          // Already added optimistically; skip.
          return;
        } else if (data.type === "tool_call") {
          const targetId = streamingMessageIdRef.current;
          if (!targetId) return;
          setMessages((prev) => {
            const newMessages = [...prev];
            const idx = newMessages.findIndex((msg) => msg.id === targetId);
            if (idx < 0) return prev;
            const msg = newMessages[idx];
            const toolCalls = msg.toolCalls ?? [];
            newMessages[idx] = {
              ...msg,
              toolCalls: [
                ...toolCalls,
                {
                  id: data.data.id,
                  name: data.data.name,
                  args:
                    typeof data.data.args === "string"
                      ? data.data.args
                      : JSON.stringify(data.data.args ?? ""),
                  result: "",
                  ok: true,
                },
              ],
            };
            return newMessages;
          });
        } else if (data.type === "tool_result") {
          const targetId = streamingMessageIdRef.current;
          if (!targetId) return;
          setMessages((prev) => {
            const newMessages = [...prev];
            const idx = newMessages.findIndex((msg) => msg.id === targetId);
            if (idx < 0) return prev;
            const msg = newMessages[idx];
            const toolCalls = msg.toolCalls ?? [];
            newMessages[idx] = {
              ...msg,
              toolCalls: toolCalls.map((tc) =>
                tc.id === data.data.id
                  ? {
                      ...tc,
                      ok: !!data.data.ok,
                      result:
                        typeof data.data.result === "string"
                          ? data.data.result
                          : JSON.stringify(data.data.result ?? ""),
                    }
                  : tc
              ),
            };
            return newMessages;
          });
        } else if (data.type === "assistant") {
          setStreamingMessageId(data.data.id);
          streamingMessageIdRef.current = data.data.id;
          setMessages((prev) => {
            const newMessages = [...prev];
            const existingIndex = newMessages.findIndex(
              (msg) => msg.id === data.data.id
            );
            if (existingIndex >= 0) {
              const existing = newMessages[existingIndex];
              newMessages[existingIndex] = {
                ...data.data,
                toolCalls: data.data.toolCalls ?? existing.toolCalls,
              };
            } else {
              newMessages.push(data.data);
            }
            return newMessages;
          });
        }
      },
      (error) => {
        console.error("Streaming error:", error);
        setIsLoading(false);
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
        if (/413|Payload Too Large/.test(error)) {
          toast.error("Files too large. Please reduce file sizes and try again.");
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
        // [DONE] received: turn finished successfully.
        setIsLoading(false);
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
      }
    );

    streamCancelRef.current = cancel;
  };

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (isRegenerating) return;
      setIsRegenerating(true);
      setIsLoading(true);
      editCancelRef.current?.();

      let response: { success: boolean; userMessage: Message; assistantMessageId: string };
      try {
        const res = await fetch(
          `${API_BASE_URL}/chat/${containerId}/messages/${messageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: newContent }),
          }
        );
        if (!res.ok) {
          if (res.status === 410) throw new Error("Cannot undo past 20 messages — snapshot was pruned.");
          else if (res.status === 404) throw new Error("Message not found.");
          else if (res.status === 400) throw new Error("Cannot edit this message.");
          else if (res.status === 409) throw new Error("A response is already in progress.");
          else throw new Error(`Edit failed: ${res.status}`);
        }
        response = await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Edit failed";
        if (/410/.test(msg)) toast.error("Cannot undo past 20 messages — snapshot was pruned.");
        else if (/404/.test(msg)) toast.error("Message not found.");
        else if (/400/.test(msg)) toast.error("Cannot edit this message.");
        else if (/409|turn_in_progress/.test(msg)) toast.error("A response is already in progress.");
        else toast.error(msg);
        setIsRegenerating(false);
        setIsLoading(false);
        return;
      }

      if (!response.success) {
        toast.error("Edit failed");
        setIsRegenerating(false);
        setIsLoading(false);
        return;
      }

      // Optimistically: append the edited user message + assistant placeholder.
      setMessages((prev) => [...prev, response.userMessage]);
      setStreamingMessageId(response.assistantMessageId);
      streamingMessageIdRef.current = response.assistantMessageId;

      const cancel = subscribeTurnStream(
        containerId,
        (data) => {
          if (data.type === "user") return;
          if (data.type === "tool_call") {
            const targetId = streamingMessageIdRef.current;
            if (!targetId) return;
            setMessages((prev) => {
              const newMessages = [...prev];
              const idx = newMessages.findIndex((msg) => msg.id === targetId);
              if (idx < 0) return prev;
              const msg = newMessages[idx];
              const toolCalls = msg.toolCalls ?? [];
              newMessages[idx] = {
                ...msg,
                toolCalls: [
                  ...toolCalls,
                  {
                    id: data.data.id,
                    name: data.data.name,
                    args:
                      typeof data.data.args === "string"
                        ? data.data.args
                        : JSON.stringify(data.data.args ?? ""),
                    result: "",
                    ok: true,
                  },
                ],
              };
              return newMessages;
            });
          } else if (data.type === "tool_result") {
            const targetId = streamingMessageIdRef.current;
            if (!targetId) return;
            setMessages((prev) => {
              const newMessages = [...prev];
              const idx = newMessages.findIndex((msg) => msg.id === targetId);
              if (idx < 0) return prev;
              const msg = newMessages[idx];
              const toolCalls = msg.toolCalls ?? [];
              newMessages[idx] = {
                ...msg,
                toolCalls: toolCalls.map((tc) =>
                  tc.id === data.data.id
                    ? {
                        ...tc,
                        ok: !!data.data.ok,
                        result:
                          typeof data.data.result === "string"
                            ? data.data.result
                            : JSON.stringify(data.data.result ?? ""),
                      }
                    : tc
                ),
              };
              return newMessages;
            });
          } else if (data.type === "assistant") {
            setStreamingMessageId(data.data.id);
            streamingMessageIdRef.current = data.data.id;
            setMessages((prev) => {
              const newMessages = [...prev];
              const existingIndex = newMessages.findIndex(
                (msg) => msg.id === data.data.id
              );
              if (existingIndex >= 0) {
                const existing = newMessages[existingIndex];
                newMessages[existingIndex] = {
                  ...data.data,
                  toolCalls: data.data.toolCalls ?? existing.toolCalls,
                };
              } else {
                newMessages.push(data.data);
              }
              return newMessages;
            });
          }
        },
        (error) => {
          toast.error(error);
          setStreamingMessageId(null);
          setIsRegenerating(false);
          setIsLoading(false);
          editCancelRef.current = null;
        },
        () => {
          setStreamingMessageId(null);
          toast.success("Regenerated from edit");
          setIsRegenerating(false);
          setIsLoading(false);
          editCancelRef.current = null;
        }
      );
      editCancelRef.current = cancel;
    },
    [containerId, isRegenerating]
  );

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
    const startWidth = sidebarRef.current?.offsetWidth || window.innerWidth / 2;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const max = Math.max(600, Math.round(window.innerWidth * 0.8));
      const newWidth = Math.min(Math.max(startWidth + delta, 240), max);
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

  const handleDeploy = async () => {
    if (!deployToken.trim()) {
      toast.error("Please enter your Vercel token");
      return;
    }
    setIsDeploying(true);
    try {
      const result = await deployToVercel(containerId, deployToken.trim());
      if (result.success) {
        setDeployUrl(result.url);
        toast.success("Deployed! Opening...");
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(result.error || "Deploy failed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deploy failed");
    } finally {
      setIsDeploying(false);
    }
  };

  const openGitModal = (action: "commit" | "push" | "pull") => {
    setGitAction(action);
    setGitMessage("");
    setGitToken("");
    setShowGitModal(true);
  };

  const handleGitAction = async () => {
    if (gitAction === "commit") {
      if (!gitMessage.trim()) {
        toast.error("Please enter a commit message");
        return;
      }
      setIsGitLoading(true);
      try {
        const res = await gitCommit(containerId, gitMessage.trim());
        if (res.success) {
          toast.success("Committed successfully!");
          setShowGitModal(false);
        } else {
          toast.error(res.error ?? "Commit failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Commit failed");
      } finally {
        setIsGitLoading(false);
      }
    } else if (gitAction === "push") {
      if (!githubRepo.trim() || !gitToken.trim()) {
        toast.error("Please connect GitHub first in project settings");
        return;
      }
      setIsGitLoading(true);
      try {
        const res = await pushToGitHub(containerId, githubRepo, gitToken.trim(), githubBranch || "main");
        if (res.success) {
          toast.success("Pushed to GitHub!");
          setShowGitModal(false);
          setGitToken("");
        } else {
          toast.error(res.error ?? "Push failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Push failed");
      } finally {
        setIsGitLoading(false);
      }
    } else if (gitAction === "pull") {
      if (!githubRepo.trim() || !gitToken.trim()) {
        toast.error("Please connect GitHub first in project settings");
        return;
      }
      setIsGitLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/containers/${containerId}/git/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: githubRepo, token: gitToken.trim(), branch: githubBranch || "main" }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Pulled from GitHub!");
          setShowGitModal(false);
          setGitToken("");
        } else {
          toast.error(data.error ?? "Pull failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Pull failed");
      } finally {
        setIsGitLoading(false);
      }
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
          src="/v1-logo.png"
          alt="Assistant Avatar"
        />
        <span className="text-sm font-medium text-[#1a1a1a]">Assistant</span>
      </div>
      <div className="rounded-xl px-4 py-3 text-sm leading-relaxed bg-[#faf9f8] border border-[#e5e5e5] text-[#1a1a1a] w-full shadow-sm relative">
        <div className="relative z-10">
          <div className="prose prose-sm max-w-none [&_h2]:text-[#1a1a1a] [&_h3]:text-[#1a1a1a] [&_h4]:text-[#1a1a1a] [&_strong]:text-[#1a1a1a]">
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
    <div className="flex h-screen bg-[#faf9f8] text-[#1a1a1a] relative overflow-hidden">
      <div className="absolute inset-0 bg-[#faf9f8]" />

      <div className="flex flex-col w-full relative z-10">
        <div className="h-14 bg-white/80 backdrop-blur-xl border-b border-[#e5e5e5] flex items-center justify-between px-4 relative">

          <div className="flex items-center gap-3 relative z-10">
            <Link
              href="/"
              className="flex items-center gap-3 text-[#1a1a1a] hover:opacity-80 transition-colors group"
            >
              <span
                className="text-lg text-[#1a1a1a] font-semibold"
                style={{ fontFamily: "XSpace, monospace" }}
              >
                changwei
              </span>
            </Link>

            <div className="h-6 w-px bg-[#e5e5e5] mx-2" />

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center gap-2 text-[#666666] hover:text-[#1a1a1a] transition-colors group"
            >
              <div className="w-7 h-7 bg-white backdrop-blur-sm border border-[#e5e5e5] rounded-lg flex items-center justify-center group-hover:bg-[#faf9f8] group-hover:border-[#cccccc] transition-all shadow-sm">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-sm font-medium">
                  {containerId.slice(0, 8)}
                </span>
                <span className="text-xs text-[#888888]">Next.js Project</span>
              </div>
              {sidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm text-[#888888] relative z-10">
            <Link
              href="/"
              className="hover:text-[#1a1a1a] transition-colors flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Projects</span>
            </Link>
            <span>/</span>
            <span className="text-[#1a1a1a] font-medium">
              {containerId.slice(0, 8)}
            </span>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            {viewMode === "preview" && (
              <button
                onClick={() => setIsDesktopView(!isDesktopView)}
                className="p-1.5 text-[#666666] hover:text-[#1a1a1a] hover:bg-[#faf9f8] rounded-md transition-all"
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

            <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5 border border-[#e5e5e5] shadow-sm">
              <button
                onClick={() => setViewMode("preview")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "preview"
                    ? "bg-[#faf9f8] text-[#1a1a1a] shadow-sm"
                    : "text-[#666666] hover:text-[#1a1a1a] hover:bg-[#f1f0ef]"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={() => setViewMode("editor")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "editor"
                    ? "bg-[#faf9f8] text-[#1a1a1a] shadow-sm"
                    : "text-[#666666] hover:text-[#1a1a1a] hover:bg-[#f1f0ef]"
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Code
              </button>
            </div>

            <div className="h-4 w-px bg-[#e5e5e5] mx-1" />

            <button
              onClick={handleRefresh}
              className="p-1.5 text-[#666666] hover:text-[#1a1a1a] hover:bg-[#faf9f8] rounded-md transition-all"
              disabled={!containerUrl}
              title="Refresh preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleExternalLink}
              className="p-1.5 text-[#666666] hover:text-[#1a1a1a] hover:bg-[#faf9f8] rounded-md transition-all"
              disabled={!containerUrl}
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => router.push(`/projects/${containerId}/settings`)}
              className="p-1.5 text-[#666666] hover:text-[#1a1a1a] hover:bg-[#faf9f8] rounded-md transition-all"
              title="Project settings"
              data-testid="open-settings-gear"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-[#e5e5e5] mx-1" />

            <button
              onClick={handleExportCode}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-[#faf9f8] disabled:bg-[#f1f0ef] text-[#1a1a1a] disabled:text-[#888888] rounded-md text-xs font-medium transition-all border border-[#e5e5e5] shadow-sm"
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
              onClick={() => setShowDeployModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1a1a1a] text-white hover:bg-[#333333] rounded-md text-xs font-medium transition-all shadow-sm"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Deploy</span>
            </button>

            <div className="h-4 w-px bg-[#e5e5e5] mx-1" />

            <button
              onClick={() => openGitModal("commit")}
              disabled={!githubRepo}
              className="p-1.5 hover:bg-[#faf9f8] rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title={githubRepo ? "Git Commit" : "Connect GitHub first in settings"}
            >
              <GitCommit className="w-3.5 h-3.5 text-[#666666] disabled:text-[#999999]" />
            </button>

            <button
              onClick={() => openGitModal("push")}
              disabled={!githubRepo}
              className="p-1.5 hover:bg-[#faf9f8] rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title={githubRepo ? "Git Push" : "Connect GitHub first in settings"}
            >
              <Upload className="w-3.5 h-3.5 text-[#666666] disabled:text-[#999999]" />
            </button>

            <button
              onClick={() => openGitModal("pull")}
              disabled={!githubRepo}
              className="p-1.5 hover:bg-[#faf9f8] rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title={githubRepo ? "Git Pull" : "Connect GitHub first in settings"}
            >
              <GitPullRequest className="w-3.5 h-3.5 text-[#666666] disabled:text-[#999999]" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <div
              ref={sidebarRef}
              style={{ width: sidebarWidth }}
              className="bg-white border-r border-[#e5e5e5] flex flex-col relative shrink-0"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
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

              <div className="flex items-center gap-3 h-12 px-4 border-b border-[#e5e5e5] relative z-10 bg-[#faf9f8]">
                <Terminal className="w-4 h-4 text-[#888888]" />
                <span className="text-sm font-medium text-[#1a1a1a]">
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
                      isRegenerating={isRegenerating}
                      onEdit={
                        message.role === "user"
                          ? (newContent) => handleEditMessage(message.id, newContent)
                          : undefined
                      }
                    />
                  ))}
                  {isLoading && !streamingMessageId && (
                    <div className="flex items-start">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-4 h-4 bg-[#e5e5e5] rounded" />
                        <span className="text-sm font-medium text-[#1a1a1a]">Assistant</span>
                      </div>
                      <div className="max-w-[80%] rounded-xl px-3 py-3 text-sm leading-relaxed bg-[#faf9f8] text-[#1a1a1a] ml-2 border border-[#e5e5e5] shadow-sm">
                        <div className="flex items-center gap-2 text-[#666666]">
                          <div className="w-4 h-4 border-2 border-[#888888] border-t-transparent rounded-full animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-[#e5e5e5] relative z-10 bg-white">
                <ChatInput
                  inputValue={inputValue}
                  setInputValue={setInputValue}
                  onSendMessage={handleSendMessage}
                  textareaRef={textareaRef}
                  onKeyDown={handleTextareaKeyDown}
                  disabled={isLoading}
                  pendingFiles={pendingFiles}
                  onRemovePendingFile={removePendingFile}
                  models={availableModels}
                  modelValue={currentModel ?? undefined}
                  onModelChange={handleModelChange}
                />
              </div>
            </div>
          )}

          <div className="flex-1 bg-[#faf9f8] relative">
            {viewMode === "preview" ? (
              <div className="h-full p-6 relative z-10">
                <div className="h-full bg-white rounded-xl border border-[#e5e5e5] overflow-hidden shadow-sm">
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

      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-md w-full max-w-md p-6">
            <h3 className="text-[#1a1a1a] font-semibold text-lg mb-1">Deploy to Vercel</h3>
            <p className="text-[#666666] text-sm mb-4">
              Enter your Vercel token to deploy this project.
            </p>
            {deployUrl ? (
              <div className="space-y-3">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">
                  Deployed successfully!
                </div>
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  {deployUrl}
                </a>
                <button
                  onClick={() => { setShowDeployModal(false); setDeployUrl(null); setDeployToken(""); }}
                  className="w-full px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-100 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="password"
                  value={deployToken}
                  onChange={(e) => setDeployToken(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleDeploy(); if (e.key === "Escape") setShowDeployModal(false); }}
                  placeholder="Vercel token (e.g. xxxxxxxxxx)"
                  autoFocus
                  className="w-full px-3 py-2 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#888888] focus:outline-none focus:border-[#999999]"
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => { setShowDeployModal(false); setDeployToken(""); }}
                    className="px-4 py-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying || !deployToken.trim()}
                    className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isDeploying ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        Deploy
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showGitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-md w-full max-w-md p-6">
            <h3 className="text-[#1a1a1a] font-semibold text-lg mb-1 flex items-center gap-2">
              {gitAction === "commit" && <><GitCommit className="w-4 h-4" /> Git Commit</>}
              {gitAction === "push" && <><Upload className="w-4 h-4" /> Git Push</>}
              {gitAction === "pull" && <><GitPullRequest className="w-4 h-4" /> Git Pull</>}
            </h3>

            {gitAction === "commit" ? (
              <div className="space-y-3 mt-4">
                <div>
                  <label className="block text-sm text-[#666666] mb-1.5">Commit message</label>
                  <input
                    type="text"
                    value={gitMessage}
                    onChange={(e) => setGitMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleGitAction(); if (e.key === "Escape") setShowGitModal(false); }}
                    placeholder="Update feature X"
                    autoFocus
                    className="w-full px-3 py-2 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#888888] focus:outline-none focus:border-[#999999]"
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowGitModal(false)}
                    className="px-4 py-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGitAction}
                    disabled={isGitLoading || !gitMessage.trim()}
                    className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGitLoading ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Committing...</>
                    ) : (
                      <><GitCommit className="w-3.5 h-3.5" /> Commit</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {githubRepo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-sm">
                    <GitBranch className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400">{githubRepo}</span>
                    <span className="text-green-300/60">/ {githubBranch}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-[#666666] mb-1.5">Personal Access Token</label>
                  <div className="relative">
                    <input
                      type={showGitToken ? "text" : "password"}
                      value={gitToken}
                      onChange={(e) => setGitToken(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleGitAction(); if (e.key === "Escape") setShowGitModal(false); }}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-2 pr-10 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#888888] focus:outline-none focus:border-[#999999]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGitToken(!showGitToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#1a1a1a]"
                    >
                      {showGitToken ? <Eye className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowGitModal(false)}
                    className="px-4 py-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGitAction}
                    disabled={isGitLoading || !gitToken.trim()}
                    className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGitLoading ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {gitAction === "push" ? "Pushing..." : "Pulling..."}</>
                    ) : (
                      <>{gitAction === "push" ? <><Upload className="w-3.5 h-3.5" /> Push</> : <><GitPullRequest className="w-3.5 h-3.5" /> Pull</>}</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
