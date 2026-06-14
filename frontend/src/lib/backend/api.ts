export const API_BASE_URL = "http://localhost:4002";

export interface Container {
  id: string;
  name: string;
  status: string;
  image: string;
  created: string;
  assignedPort: number | null;
  url: string | null;
  ports: Array<{
    private: number;
    public: number;
    type: string;
  }>;
  labels: Record<string, string>;
}

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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateContainerResponse {
  containerId: string;
  container: {
    id: string;
    containerId: string;
    status: string;
    port: number;
    url: string;
    createdAt: string;
    type: string;
  };
}

export interface StartContainerResponse {
  containerId: string;
  port: number;
  url: string;
  status: string;
  message: string;
}

export interface StopContainerResponse {
  containerId: string;
  status: string;
  message: string;
}

export interface DeleteContainerResponse {
  containerId: string;
  message: string;
}

export interface ChatResponse {
  success: boolean;
  userMessage: Message;
  assistantMessage: Message;
}

export interface ChatHistoryResponse {
  success: boolean;
  messages: Message[];
  sessionId: string;
}

export interface Model {
  id: string;
  name: string;
}

export interface GetModelsResponse {
  success: boolean;
  models: Model[];
}

const FETCH_TIMEOUT_MS = 120000;

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(`请求超时(${FETCH_TIMEOUT_MS / 1000}秒)，请确认后端已启动且可访问: ${API_BASE_URL}（若通过端口转发访问请改用浏览器直接打开 localhost）`);
      }
      if (/fetch|network|Failed to fetch/i.test(err.message)) {
        throw new Error(
          `无法连接后端，请确认后端已启动 (${API_BASE_URL})`
        );
      }
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface GetContainersResult {
  containers: Container[];
  dockerAvailable: boolean;
  error?: string;
}

export async function getContainers(): Promise<GetContainersResult> {
  const response = await fetchApi<{
    success: boolean;
    containers: Container[];
    dockerAvailable?: boolean;
    error?: string;
  }>("/containers");
  return {
    containers: response.containers ?? [],
    dockerAvailable: response.dockerAvailable ?? true,
    error: response.error,
  };
}

export async function createContainer(): Promise<CreateContainerResponse> {
  const response = await fetchApi<
    { success: boolean } & CreateContainerResponse
  >("/containers/create", { method: "POST" });
  return response;
}

export async function importFromGitHub(githubUrl: string, branch?: string): Promise<CreateContainerResponse> {
  const response = await fetchApi<{ success: boolean } & CreateContainerResponse>(
    "/containers/import/github",
    {
      method: "POST",
      body: JSON.stringify({ githubUrl, branch: branch || undefined }),
    }
  );
  return response;
}

export async function importFromZip(file: File): Promise<CreateContainerResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/containers/import/zip`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Import failed");
  }
  return res.json();
}

export async function startContainer(
  containerId: string
): Promise<StartContainerResponse> {
  const response = await fetchApi<
    { success: boolean } & StartContainerResponse
  >(`/containers/${containerId}/start`, { method: "POST" });
  return response;
}

export async function stopContainer(
  containerId: string
): Promise<StopContainerResponse> {
  const response = await fetchApi<{ success: boolean } & StopContainerResponse>(
    `/containers/${containerId}/stop`,
    { method: "POST" }
  );
  return response;
}

export async function deleteContainer(
  containerId: string
): Promise<DeleteContainerResponse> {
  const response = await fetchApi<
    { success: boolean } & DeleteContainerResponse
  >(`/containers/${containerId}`, { method: "DELETE" });
  return response;
}

export async function getChatHistory(
  containerId: string
): Promise<ChatHistoryResponse> {
  const response = await fetchApi<ChatHistoryResponse>(
    `/chat/${containerId}/messages`
  );
  return response;
}

export async function getModels(): Promise<Model[]> {
  const response = await fetchApi<GetModelsResponse>("/models");
  return response.models ?? [];
}

export async function sendChatMessage(
  containerId: string,
  message: string,
  attachments?: any[],
  model?: string
): Promise<ChatResponse> {
  const body: Record<string, any> = { message, attachments };
  if (model) body.model = model;
  const response = await fetchApi<ChatResponse>(
    `/chat/${containerId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return response;
}

export function sendChatMessageStream(
  containerId: string,
  message: string,
  attachments: any[] = [],
  onMessage: (data: any) => void,
  onError?: (error: string) => void,
  onComplete?: () => void,
  model?: string
): () => void {
  let abortController = new AbortController();

  const body: Record<string, any> = { message, attachments, stream: true };
  if (model) body.model = model;

  fetch(`${API_BASE_URL}/chat/${containerId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                onComplete?.();
                return;
              }
              if (data) {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === "error") {
                    onError?.(parsed.data?.error || "Unknown error");
                    onComplete?.();
                    return;
                  }
                  onMessage(parsed);
                } catch (e) {
                  console.error("Failed to parse SSE data:", data, e);
                }
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        throw error;
      }
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Stream error:", error);
      onError?.(error.message || "Connection error");
    });

  return () => {
    abortController.abort();
  };
}
