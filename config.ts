// AI SDK configuration — all sensitive values loaded from environment variables

export const config = {
  aiSdk: {
    // The base URL for the AI SDK (e.g. OpenRouter, OpenAI, Ollama)
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",

    // Your API key for the AI provider
    apiKey: process.env.AI_API_KEY || "",

    // The model to use (e.g. anthropic/claude-sonnet-4, gpt-4o)
    model: process.env.AI_MODEL || "anthropic/claude-sonnet-4",

    // Sampling temperature (0-2)
    temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
  },
} as const;
