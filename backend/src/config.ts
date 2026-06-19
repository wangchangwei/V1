// Centralized configuration for the V1 backend.
// All sensitive or environment-dependent values live here so service modules
// can stay declarative and testable.

// Models available for the chat UI. The list is exposed via
// GET /chat/:containerId/model and rendered as a dropdown in the chat header.
// Add a new model here and the UI picks it up automatically.
//
// IDs are the actual model strings accepted by the MiniMax Anthropic-compatible
// proxy. Provider is "anthropic" for all three because the proxy speaks the
// Anthropic Messages API.
export const MODELS = [
  {
    id: "MiniMax-M2.7-highspeed",
    displayName: "M2.7 高速版",
    provider: "minimax",
    description: "最新最强模型，高速推理",
  },
  {
    id: "MiniMax-M2.7",
    displayName: "M2.7 标准版",
    provider: "minimax",
    description: "M2 最新版本",
  },
  {
    id: "MiniMax-M2.5-highspeed",
    displayName: "M2.5 高速版",
    provider: "minimax",
    description: "平衡速度与质量",
  },
  {
    id: "MiniMax-M2",
    displayName: "M2 标准版",
    provider: "minimax",
    description: "稳定可靠",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  displayName: string;
  provider: string;
  description: string;
}>;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "MiniMax-M2.7-highspeed";

export const config = {
  pi: {
    image: process.env.PI_IMAGE ?? "v1-pi:latest",
    internalPort: Number(process.env.PI_INTERNAL_PORT ?? 7890),
    hostPortRange: { start: 9000, size: 100 },
    healthCheck: {
      initialWaitMs: 2000,
      retryIntervalMs: 2000,
      maxAttempts: 5,
    },
    containerResources: {
      memory: "2g",
      cpus: "2",
      pidsLimit: 256,
    },
    // Shared secret for host<->pi-container auth on /v1/chat/completions.
    // When unset, startPiContainer mints a per-process random secret and
    // every container it spawns shares it (since they're per-host).
    // Set PI_SECRET in the host environment to pin a stable value across restarts.
    secret: process.env.PI_SECRET ?? "",
  },
} as const;
