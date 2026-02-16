import { spawn } from "child_process";
import { config } from "../../config";

export type CursorMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * 按飞书 cursor-bot 方式调用 Cursor CLI（与 cursor-bot 一致）：
 * - 命令: agent（依赖 PATH，或 config 中的路径）
 * - 参数: -p --force --output-format stream-json --stream-partial-output --approve-mcps
 * - 提示词通过 stdin 传入（非命令行参数）
 * - 从 stdout 解析 JSON 行，取 type=result 或 type=assistant 的内容
 */
function buildPrompt(systemPrompt: string, messages: CursorMessage[]): string {
  const lines = [
    "[System]",
    systemPrompt,
    "",
    "[Conversation]",
    ...messages.map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`),
    "",
    "Reply as the assistant to the last user message. Output only the assistant response, no prefix.",
  ];
  return lines.join("\n");
}

export async function callCursorCli(
  systemPrompt: string,
  messages: CursorMessage[],
  workspaceDir?: string
): Promise<string> {
  const fullPrompt = buildPrompt(systemPrompt, messages);
  const cliPath = config.aiSdk.cursorCliPath ?? "agent";
  const baseArgs = config.aiSdk.cursorArgs ?? [];

  const args = [
    ...baseArgs,
    "-p",
    "--force",
    "--output-format",
    "stream-json",
    "--stream-partial-output",
    "--approve-mcps",
    ...(workspaceDir ? ["--workspace", workspaceDir] : []),
  ];

  const cleanEnv = { ...process.env };
  delete (cleanEnv as any).CURSOR_CLI;
  delete (cleanEnv as any).CURSOR_AGENT;

  const shellOption =
    process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : true;

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      cwd: process.cwd(),
      env: cleanEnv,
      shell: shellOption,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let result = "";
    let accumulatedText = "";

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (data: string) => {
      const lines = data.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.type === "result" && json.result) {
            result = json.result;
          }
          if (json.type === "assistant" && json.message?.content?.[0]?.text) {
            const chunkText = json.message.content[0].text;
            if (json.timestamp_ms) {
              accumulatedText += chunkText;
            } else {
              accumulatedText = chunkText;
            }
          }
        } catch (_) {
          // 忽略非 JSON 行
        }
      }
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      console.log("[Cursor CLI stderr]", chunk.slice(0, 300));
    });

    child.on("error", (err) => {
      reject(new Error(`Cursor CLI spawn error: ${err.message}`));
    });

    child.on("close", (code) => {
      const finalResult = result || accumulatedText.trim();
      if (finalResult) {
        resolve(finalResult);
      } else if (code === 0) {
        resolve("任务完成");
      } else {
        reject(
          new Error(
            `Cursor CLI exited with code ${code}. 请确认已安装 Cursor 且 agent 在 PATH 中（或配置 cursorCliPath）。`
          )
        );
      }
    });

    child.stdin.write(fullPrompt, "utf-8");
    child.stdin.end();
  });
}
