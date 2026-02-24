// Make sure to replace the values with your actual API key and model

// USING ANTHROPIC CLAUDE SONNET 4 is strongly recommended for best results

export const config = {
  aiSdk: {
    provider: "cursor" as "openai" | "cursor",

    // The base URL for the AI SDK, leave blank for e.g. openai
    baseUrl: "https://openrouter.ai/api/v1",

    // Your API key for provider, if using Ollama enter "ollama" here
    apiKey: "sk-or-v1-824...",

    // The model to use, e.g., "gpt-4", "gpt-3.5-turbo", or "ollama/llama2"
    model: "anthropic/claude-sonnet-4",

    // Cursor 供应商：本地 Cursor Agent CLI 路径（仅当 provider === "cursor" 时需要）
    cursorCliPath:
      process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\cursor-agent\\agent.cmd`
        : "",
    cursorArgs: [] as string[],
    cursorApiKey: "",
  },
} as const;
