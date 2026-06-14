// Make sure to replace the values with your actual API key and model

// USING ANTHROPIC CLAUDE SONNET 4 is strongly recommended for best results

export const config = {
  aiSdk: {
    provider: "cursor" as "openai" | "cursor",

    // The base URL for the AI SDK — read from env, fallback to openai
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",

    // Your API key for provider, if using Ollama enter "ollama" here
    apiKey: process.env.AI_API_KEY || "",

    // The model to use, e.g., "gpt-4", "gpt-3.5-turbo", or "ollama/llama2"
    model: process.env.AI_MODEL || "anthropic/claude-sonnet-4",

    temperature: process.env.AI_TEMPERATURE
      ? parseFloat(process.env.AI_TEMPERATURE)
      : 0.7,

    // Cursor 供应商：本地 Cursor Agent CLI 路径（仅当 provider === "cursor" 时需要）
    cursorCliPath:
      process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\cursor-agent\\agent.cmd`
        : "",
    cursorArgs: [] as string[],
    cursorApiKey: "",
  },
} as const;
