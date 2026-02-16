// Make sure to replace the values with your actual API key and model

// AI 提供方: "openai" = OpenAI 兼容 API（OpenRouter/Ollama/OpenAI 等）；"cursor" = 本地 Cursor CLI headless
export const config = {
  aiSdk: {
    // "openai" | "cursor"
    provider: "cursor" as const,  // 本地 Cursor CLI

    // ========== 当 provider === "openai" 时使用 ==========
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",  // 从环境变量读取
    model: "anthropic/claude-3.5-sonnet",  // Claude 3.5 Sonnet

    // ========== 当 provider === "cursor" 时使用（与 cursor-bot 一致）==========
    // 命令名，依赖 PATH；或指定完整路径如 Windows 下 agent.cmd
    cursorCliPath: process.env.CURSOR_AGENT_PATH || "agent",
    cursorArgs: [],
  },
} as const;
