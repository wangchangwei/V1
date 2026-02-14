// Make sure to replace the values with your actual API key and model

// AI 提供方: "openai" = OpenAI 兼容 API（OpenRouter/Ollama/OpenAI 等）；"cursor" = 本地 Cursor CLI headless
export const config = {
  aiSdk: {
    // "openai" | "cursor"
    provider: "openai" as const,  // 切换到 OpenRouter（更稳定）

    // ========== 当 provider === "openai" 时使用 ==========
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",  // 从环境变量读取
    model: "anthropic/claude-3.5-sonnet",  // Claude 3.5 Sonnet

    // ========== 当 provider === "cursor" 时使用（https://cursor.com/docs/cli/headless）==========
    // Windows: Cursor Headless CLI (agent) 路径
    cursorCliPath: process.platform === "win32" 
      ? `${process.env.LOCALAPPDATA}\\cursor-agent\\agent.cmd`
      : "agent",
    // 基础参数（不需要 agent 子命令，agent.cmd 本身就是命令）；实际会追加 -p "<prompt>" --output-format text
    cursorArgs: [],
  },
} as const;
