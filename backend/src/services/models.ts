export interface Model {
  id: string;       // passed as model param in chat requests
  name: string;     // human-readable label shown in dropdown
}

const ANTHROPIC_MODELS: Model[] = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "anthropic/claude-opus-4", name: "Claude Opus 4" },
  { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4" },
];

const MINIMAX_MODELS: Model[] = [
  { id: "MiniMax-M3", name: "MiniMax-M3" },
  { id: "MiniMax-M2.7", name: "MiniMax-M2.7" },
  { id: "MiniMax-M2.7-highspeed", name: "MiniMax-M2.7-Highspeed" },
  { id: "MiniMax-M2.5", name: "MiniMax-M2.5" },
  { id: "MiniMax-M2.5-highspeed", name: "MiniMax-M2.5-Highspeed" },
  { id: "MiniMax-M2.1", name: "MiniMax-M2.1" },
  { id: "MiniMax-M2.1-highspeed", name: "MiniMax-M2.1-Highspeed" },
  { id: "MiniMax-M2", name: "MiniMax-M2" },
];

const OLLAMA_MODELS: Model[] = [
  { id: "llama3", name: "Llama 3" },
  { id: "llama3.1", name: "Llama 3.1" },
  { id: "mistral", name: "Mistral" },
  { id: "codellama", name: "CodeLlama" },
];

const OPENAI_MODELS: Model[] = [
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
];

const OPENROUTER_MODELS: Model[] = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (OR)" },
  { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4 (OR)" },
  { id: "openai/gpt-4o", name: "GPT-4o (OR)" },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5 (OR)" },
];

let cachedModels: Model[] = [];

function computeSupportedModels(baseUrl: string): Model[] {
  const url = baseUrl.toLowerCase();
  if (url.includes("minimax")) return MINIMAX_MODELS;
  if (url.includes("anthropic")) return ANTHROPIC_MODELS;
  if (url.includes("openrouter")) return OPENROUTER_MODELS;
  if (url.includes("ollama")) return OLLAMA_MODELS;
  return OPENAI_MODELS;
}

export function initModels(baseUrl: string): void {
  cachedModels = computeSupportedModels(baseUrl);
  console.log(`[models] baseUrl="${baseUrl}" Supported: ${cachedModels.map((m) => m.name).join(", ")}`);
}

export function getSupportedModels(): Model[] {
  return cachedModels;
}

export function isSupportedModel(model: string): boolean {
  return cachedModels.some((m) => m.id === model);
}
