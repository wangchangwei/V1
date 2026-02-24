import { spawn } from "child_process";
import { config } from "../../config";

export type CursorMessage = { role: "user" | "assistant" | "system"; content: string };

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

function parseStreamJson(output: string): string {
  let accumulatedText = "";
  let result = "";

  const lines = output.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.type === "result" && json.result) {
        result = json.result;
      }
      if (json.type === "assistant" && json.message?.content?.[0]?.text) {
        const chunk = json.message.content[0].text;
        if (json.timestamp_ms) {
          accumulatedText += chunk;
        } else {
          accumulatedText = chunk;
        }
      }
    } catch (_) {}
  }

  return result || accumulatedText;
}

export async function callCursorCli(
  systemPrompt: string,
  messages: CursorMessage[],
  workspaceDir?: string
): Promise<string> {
  const cliPath = config.aiSdk.cursorCliPath;
  const baseArgs = (config.aiSdk as any).cursorArgs ?? [];

  if (!cliPath || typeof cliPath !== "string") {
    throw new Error(
      "Cursor 供应商未配置：请在 backend/config.ts 的 aiSdk 中设置 cursorCliPath（指向 Cursor Agent CLI 可执行路径，如 agent.cmd）。"
    );
  }

  const fullPrompt = buildPrompt(systemPrompt, messages);

  // 与 cursor-bot 保持一致：prompt 通过 stdin 传入，不作为命令行参数
  const args = [
    ...baseArgs,
    "-p",
    "--force",
    "--output-format", "stream-json",
    "--stream-partial-output",
    "--approve-mcps",
    "--trust",
  ];

  const cursorApiKey =
    (config.aiSdk as any).cursorApiKey ?? process.env.CURSOR_API_KEY ?? "";
  const childEnv = { ...process.env } as Record<string, string>;
  if (cursorApiKey) childEnv.CURSOR_API_KEY = cursorApiKey;

  // 绕过本地代理，避免 127.0.0.1:7890 拦截 Cursor CLI 的网络请求
  childEnv.HTTP_PROXY = "";
  childEnv.HTTPS_PROXY = "";
  childEnv.http_proxy = "";
  childEnv.https_proxy = "";
  childEnv.NO_PROXY = "*";
  childEnv.no_proxy = "*";

  const cwd = workspaceDir || process.cwd();
  const shellOption =
    process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe"
      : true;

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      cwd,
      env: childEnv,
      shell: shellOption as any,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      reject(new Error(`Cursor CLI spawn error: ${err.message}`));
    });

    child.on("close", (code, signal) => {
      if (code !== 0 && code !== null && stdout.trim() === "") {
        reject(
          new Error(
            `Cursor CLI exited ${code}${signal ? ` (${signal})` : ""}. stderr: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }

      const parsed = parseStreamJson(stdout);
      resolve(parsed || stdout.trim() || "No response from Cursor CLI.");
    });

    // cursor-bot 的做法：把 prompt 写入 stdin，然后关闭
    child.stdin.on("error", () => {
      // stdin 管道关闭时忽略写入错误，避免崩溃整个进程
    });
    try {
      child.stdin.write(fullPrompt);
      child.stdin.end();
    } catch (_) {
      // 忽略同步写入错误（Bun Windows 上 EOF 问题）
    }
  });
}
