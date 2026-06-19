export const API_BASE_URL =
  typeof window !== "undefined"
    ? // In browser: use current host so LAN access works (e.g. http://192.168.1.x:4002)
      `${window.location.protocol}//${window.location.hostname}:4002`
    : // Server-side: fallback to localhost
      "http://localhost:4002";

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
  displayName?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result: string;
  ok: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
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
  assistantMessageId: string;
}

export interface ChatHistoryResponse {
  success: boolean;
  messages: Message[];
  sessionId: string;
}

export interface EnrichPromptResponse {
  success: boolean;
  enriched?: string;
  error?: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  description: string;
}

export interface GetModelsResponse {
  success: boolean;
  current: string;
  available: ModelInfo[];
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

export async function updateProjectDisplayName(
  projectId: string,
  displayName: string
): Promise<{ success: boolean; displayName: string }> {
  return fetchApi(`/containers/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
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

export interface DeployResponse {
  success: boolean;
  url: string;
  deploymentId: string;
  status: string;
  error?: string;
}

export async function deployToVercel(
  containerId: string,
  vercelToken: string
): Promise<DeployResponse> {
  return fetchApi<DeployResponse>(`/deploy/${containerId}`, {
    method: "POST",
    body: JSON.stringify({ vercelToken }),
  });
}

export async function getProjectModel(
  containerId: string
): Promise<{ current: string; available: ModelInfo[] }> {
  const response = await fetchApi<GetModelsResponse>(
    `/chat/${containerId}/model`
  );
  return { current: response.current, available: response.available ?? [] };
}

export async function setProjectModel(
  containerId: string,
  model: string
): Promise<string> {
  const response = await fetchApi<{ success: boolean; model: string }>(
    `/chat/${containerId}/model`,
    {
      method: "POST",
      body: JSON.stringify({ model }),
    }
  );
  return response.model;
}

export async function getChatHistory(
  containerId: string
): Promise<ChatHistoryResponse> {
  const response = await fetchApi<ChatHistoryResponse>(
    `/chat/${containerId}/messages`
  );
  return response;
}

export async function getTurnStatus(
  containerId: string
): Promise<{ processing: boolean; inProgressTurn?: { userMsgId: string; assistantMsgId: string; partialText: string; toolCalls: ToolCall[]; startedAt: string } }> {
  return fetchApi(`/chat/${containerId}/turn-status`);
}

export async function enrichPrompt(
  prompt: string,
  template: string
): Promise<string> {
  const response = await fetchApi<EnrichPromptResponse>("/prompts/enrich", {
    method: "POST",
    body: JSON.stringify({ prompt, template }),
  });
  if (!response.success || !response.enriched) {
    throw new Error(response.error || "AI enrichment failed");
  }
  return response.enriched;
}

export async function sendChatMessage(
  containerId: string,
  message: string,
  attachments?: any[]
): Promise<ChatResponse> {
  const response = await fetchApi<ChatResponse>(
    `/chat/${containerId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ message, attachments }),
    }
  );
  return response;
}

// Subscribe to the in-flight turn's remaining chunks via EventSource.
// Returns an unsubscribe function. We disable EventSource's automatic reconnect
// so callers control retry cadence (e.g. via turn-status polling).
export function subscribeTurnStream(
  containerId: string,
  onMessage: (data: any) => void,
  onError?: (error: string) => void,
  onComplete?: () => void
): () => void {
  const es = new EventSource(`${API_BASE_URL}/chat/${containerId}/turn-stream`);

  es.onmessage = (ev) => {
    if (ev.data === "[DONE]") {
      onComplete?.();
      es.close();
      return;
    }
    try {
      const parsed = JSON.parse(ev.data);
      onMessage(parsed);
    } catch (err) {
      console.error("Failed to parse SSE data:", ev.data, err);
    }
  };

  es.onerror = () => {
    onError?.("SSE connection error");
    es.close();
  };

  return () => es.close();
}

