import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { config } from "../../config";

export type CursorMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * 按 https://cursor.com/docs/cli/headless 约定调用 Cursor CLI：
 * - 使用 print 模式：agent -p "prompt"（提示词为命令行参数）
 * - 从 stdout 读取助手回复（默认 text 格式）
 * 若提示词过长超过命令行限制，则写入临时文件并传入。
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

const MAX_ARG_LENGTH = 7000;

export async function callCursorCli(
  systemPrompt: string,
  messages: CursorMessage[],
  workspaceDir?: string
): Promise<string> {
  const cliPath = config.aiSdk.cursorCliPath;
  const baseArgs = config.aiSdk.cursorArgs ?? [];
  const fullPrompt = buildPrompt(systemPrompt, messages);

  let promptArg = fullPrompt;
  let tempFile: string | null = null;

  if (fullPrompt.length > MAX_ARG_LENGTH) {
    tempFile = path.join(os.tmpdir(), `cursor-prompt-${Date.now()}.txt`);
    await fs.writeFile(tempFile, fullPrompt, "utf-8");
    const absPath = path.resolve(tempFile);
    promptArg = `The full prompt (system instructions and conversation) is in this file: ${absPath}. Read it, then output only the assistant's response to the last user message, with no prefix or label.`;
  }

  // agent 命令参数：
  // -p: print mode (headless)
  // --output-format text: 纯文本输出
  // --trust: 信任工作区（headless 模式需要）
  // --workspace: 指定工作目录
  const args = [
    ...baseArgs,
    "-p",
    "--output-format", "text",
    "--trust",
    ...(workspaceDir ? ["--workspace", workspaceDir] : []),
    promptArg
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: { ...process.env },
      cwd: process.cwd(),
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

    child.on("close", async (code, signal) => {
      if (tempFile) {
        try {
          await fs.unlink(tempFile);
        } catch (_) {}
      }
      if (code !== 0 && code !== null && stdout.trim() === "") {
        reject(
          new Error(
            `Cursor CLI exited ${code}${signal ? ` (${signal})` : ""}. stderr: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }
      resolve(stdout.trim() || "No response from Cursor CLI.");
    });
  });
}
