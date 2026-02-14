#!/usr/bin/env node
/**
 * December 调用 Cursor CLI 时的约定：
 * - 从 stdin 读入一行 JSON：{ "system": string, "messages": [{ "role": "user"|"assistant"|"system", "content": string }] }
 * - 向 stdout 输出助手的回复正文（纯文本），然后进程退出。
 *
 * 若系统上的 cursor agent 不接受该格式，可将 config.aiSdk.cursorCliPath 指向本脚本，
 * 在下面实现中改为你本地 Cursor headless 的调用方式（例如调 Cursor 的 HTTP API 或其它 CLI）。
 *
 * 本示例：直接回显最后一条用户消息（仅用于测试连通性）。
 */

import { createInterface } from "readline";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const line = await new Promise((resolve) => {
    rl.once("line", resolve);
  });
  rl.close();

  let payload;
  try {
    payload = JSON.parse(line);
  } catch (e) {
    process.stderr.write("cursor-cli-wrapper: invalid JSON from stdin\n");
    process.exit(1);
  }

  const { system, messages } = payload;
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user");
  const lastContent = lastUser?.content ?? "";

  // 示例：只回显最后一条用户消息（实际应改为调用 Cursor 获取真实回复）
  process.stdout.write("Echo (replace with real Cursor call): " + lastContent.slice(0, 200));
}

main().catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});
