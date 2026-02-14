import { spawn } from "child_process";
import path from "path";
import { PROJECTS_DIR } from "./project";

export async function addDependency(
  projectId: string,
  packageName: string,
  isDev: boolean = false
): Promise<string> {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  const args = ["add", packageName];
  if (isDev) args.push("--dev");

  return new Promise((resolve, reject) => {
    const child = spawn("bun", args, {
      cwd: projectDir,
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const output = stdout || stderr;
      if (code === 0) resolve(output);
      else reject(new Error(stderr || stdout || `bun add exited with ${code}`));
    });
    child.on("error", reject);
  });
}
