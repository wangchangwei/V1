import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

export const PROJECTS_DIR = path.join(os.homedir(), "december-projects");
const BASE_PORT = 8000;
const DATA_DIR = path.join(process.cwd(), "data");
const PROJECTS_JSON = path.join(DATA_DIR, "projects.json");

interface ProjectMeta {
  port: number;
  createdAt: string;
  displayName?: string;
}

interface ProjectsStore {
  [projectId: string]: ProjectMeta;
}

const usedPorts = new Set<number>();
const runningProcesses = new Map<
  string,
  { process: ReturnType<typeof spawn>; port: number }
>();

async function loadProjectsStore(): Promise<ProjectsStore> {
  try {
    const raw = await fs.readFile(PROJECTS_JSON, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveProjectsStore(store: ProjectsStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PROJECTS_JSON, JSON.stringify(store, null, 2));
}

export async function updateProjectDisplayName(
  projectId: string,
  displayName: string
): Promise<void> {
  const store = await loadProjectsStore();
  if (!store[projectId]) {
    throw new Error(`Project ${projectId} not found`);
  }
  store[projectId].displayName = displayName;
  await saveProjectsStore(store);
}

async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const command =
      process.platform === "win32"
        ? `netstat -ano | findstr :${port}`
        : `lsof -i :${port}`;
    const { stdout } = await execAsync(command);
    return stdout.trim() === "";
  } catch {
    return true;
  }
}

function releasePort(port: number): void {
  usedPorts.delete(port);
}

async function getAllAssignedPorts(): Promise<number[]> {
  const store = await loadProjectsStore();
  const fromStore = Object.values(store).map((m) => m.port);
  return [...new Set([...fromStore, ...runningProcesses.values()].map((p) => p.port))];
}

async function findAvailablePort(startPort: number = BASE_PORT): Promise<number> {
  const assignedPorts = await getAllAssignedPorts();
  const allUsedPorts = new Set([...usedPorts, ...assignedPorts]);

  for (let port = startPort; port < startPort + 1000; port++) {
    if (!allUsedPorts.has(port) && (await isPortAvailable(port))) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new Error("No available ports found");
}

async function ensureProjectsDir(): Promise<void> {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

async function isPortListening(port: number): Promise<boolean> {
  return !(await isPortAvailable(port));
}

// 后端重启后，检测哪些项目的端口仍在监听，将其重新标记为 running
export async function recoverRunningProjects(): Promise<void> {
  const store = await loadProjectsStore();
  for (const [projectId, meta] of Object.entries(store)) {
    if (runningProcesses.has(projectId)) continue;
    if (await isPortListening(meta.port)) {
      usedPorts.add(meta.port);
      // 进程已 detached，无法拿到句柄；用 null 占位，只需标记 running
      runningProcesses.set(projectId, { process: null as any, port: meta.port });
      console.log(`[recover] Project ${projectId} already running on port ${meta.port}`);
    } else {
      // 端口不再监听，说明进程已退出，从 store 中移除，避免误报为 running
      delete store[projectId];
      console.log(`[recover] Project ${projectId} on port ${meta.port} is not listening — removed from store`);
    }
  }
  await saveProjectsStore(store);
}

// Vendored Next.js template used to scaffold new V1 projects.
// The source lives at backend/template/ so we don't reach out to a remote
// repo at runtime — updates flow through normal git pulls of V1 itself.
const TEMPLATE_DIR = path.join(import.meta.dirname, "..", "..", "template");

async function initializeProjectOnHost(projectId: string): Promise<string> {
  await ensureProjectsDir();
  const projectDir = path.join(PROJECTS_DIR, projectId);

  console.log(`Initializing project on host from ${TEMPLATE_DIR}`);

  // Copy the vendored template into a fresh project directory. fs.cp
  // requires the destination to NOT exist, so we remove any leftover first
  // (initialization is only called for brand-new project ids).
  await fs.rm(projectDir, { recursive: true, force: true });
  try {
    await fs.cp(TEMPLATE_DIR, projectDir, { recursive: true });
    console.log(`Template copied to ${projectDir}`);
  } catch (error) {
    console.error("Template copy failed:", error);
    throw new Error(
      `Failed to copy template: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return projectDir;
}

function runBunInstall(projectDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["install"], {
      cwd: projectDir,
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bun install failed: ${stderr || code}`));
    });
    child.on("error", reject);
  });
}

function runBunDev(projectDir: string, port: number): ReturnType<typeof spawn> {
  const child = spawn("bun", ["run", "dev"], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    detached: false,
    shell: false,
    windowsHide: true,
  });
  return child;
}

export async function listProjects(): Promise<any[]> {
  const store = await loadProjectsStore();
  const result: any[] = [];

  for (const [projectId, meta] of Object.entries(store)) {
    const projectDir = path.join(PROJECTS_DIR, projectId);
    try {
      await fs.access(projectDir);
    } catch {
      continue;
    }

    const running = runningProcesses.get(projectId);
    const port = running?.port ?? meta.port;
    const status = running ? "running" : "exited";

    result.push({
      id: projectId,
      dockerId: projectId,
      name: `dec-nextjs-${projectId.slice(0, 8)}`,
      status,
      image: "local",
      created: meta.createdAt,
      assignedPort: port,
      url: port ? `http://127.0.0.1:${port}` : null,
      displayName: meta.displayName,
      ports: port ? [{ private: 3000, public: port, type: "tcp" }] : [],
      labels: { project: "december", containerId: projectId },
    });
  }

  return result.sort(
    (a, b) =>
      new Date(b.created).getTime() - new Date(a.created).getTime()
  );
}

// 把已经初始化好的 projectDir（由 import 服务创建）注册进来并启动
export async function registerAndStartProject(projectId: string): Promise<{
  port: number;
  containerLike: { id: string; containerId: string; status: string; port: number; url: string; createdAt: string; type: string };
}> {
  const assignedPort = await findAvailablePort();
  const projectDir = path.join(PROJECTS_DIR, projectId);

  const store = await loadProjectsStore();
  store[projectId] = { port: assignedPort, createdAt: new Date().toISOString() };
  await saveProjectsStore(store);

  const child = runBunDev(projectDir, assignedPort);
  runningProcesses.set(projectId, { process: child, port: assignedPort });

  child.on("exit", (code) => {
    runningProcesses.delete(projectId);
    releasePort(assignedPort);
    if (code !== null && code !== 0) {
      console.log(`Project ${projectId} process exited with code ${code}`);
    }
  });

  console.log(`[import] Project ${projectId} running on port ${assignedPort}`);

  return {
    port: assignedPort,
    containerLike: {
      id: projectId,
      containerId: projectId,
      status: "running",
      port: assignedPort,
      url: `http://127.0.0.1:${assignedPort}`,
      createdAt: store[projectId].createdAt,
      type: "Next.js App",
    },
  };
}

export async function createProject(): Promise<{
  projectId: string;
  port: number;
  containerLike: { id: string; containerId: string; status: string; port: number; url: string; createdAt: string; type: string };
}> {
  const projectId = uuidv4();
  const projectDir = await initializeProjectOnHost(projectId);
  const assignedPort = await findAvailablePort();

  const store = await loadProjectsStore();
  store[projectId] = { port: assignedPort, createdAt: new Date().toISOString() };
  await saveProjectsStore(store);

  console.log(`Installing dependencies in ${projectDir}...`);
  await runBunInstall(projectDir);

  const child = runBunDev(projectDir, assignedPort);
  runningProcesses.set(projectId, { process: child, port: assignedPort });

  child.on("exit", (code) => {
    runningProcesses.delete(projectId);
    releasePort(assignedPort);
    if (code !== null && code !== 0) {
      console.log(`Project ${projectId} process exited with code ${code}`);
    }
  });

  console.log(`Project ${projectId} running on port ${assignedPort}`);

  return {
    projectId,
    port: assignedPort,
    containerLike: {
      id: projectId,
      containerId: projectId,
      status: "running",
      port: assignedPort,
      url: `http://127.0.0.1:${assignedPort}`,
      createdAt: store[projectId].createdAt,
      type: "Next.js App",
    },
  };
}

export async function startProject(projectId: string): Promise<{ port: number }> {
  const running = runningProcesses.get(projectId);
  if (running) {
    return { port: running.port };
  }

  const store = await loadProjectsStore();
  const meta = store[projectId];
  if (!meta) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const projectDir = path.join(PROJECTS_DIR, projectId);
  try {
    await fs.access(projectDir);
  } catch {
    throw new Error(`Project directory not found: ${projectId}`);
  }

  const port = meta.port;
  if (!(await isPortAvailable(port))) {
    // 端口已被占用，说明 bun dev 进程在后端重启前已在运行，直接重新注册
    usedPorts.add(port);
    runningProcesses.set(projectId, { process: null as any, port });
    console.log(`Project ${projectId} re-registered on existing port ${port}`);
    return { port };
  }
  usedPorts.add(port);

  const child = runBunDev(projectDir, port);
  runningProcesses.set(projectId, { process: child, port });

  child.on("exit", (code) => {
    runningProcesses.delete(projectId);
    releasePort(port);
    if (code !== null && code !== 0) {
      console.log(`Project ${projectId} process exited with code ${code}`);
    }
  });

  console.log(`Started project ${projectId} on port ${port}`);
  return { port };
}

export async function stopProject(projectId: string): Promise<void> {
  const running = runningProcesses.get(projectId);
  if (!running) {
    throw new Error(`Project not running: ${projectId}`);
  }

  try { running.process?.kill("SIGTERM"); } catch (_) {}
  releasePort(running.port);
  runningProcesses.delete(projectId);
  console.log(`Stopped project ${projectId}, released port ${running.port}`);
}

export async function deleteProject(projectId: string): Promise<void> {
  const running = runningProcesses.get(projectId);
  if (running) {
    try { running.process?.kill("SIGTERM"); } catch (_) {}
    releasePort(running.port);
    runningProcesses.delete(projectId);
  }

  const store = await loadProjectsStore();
  delete store[projectId];
  await saveProjectsStore(store);

  const projectDir = path.join(PROJECTS_DIR, projectId);
  await fs.rm(projectDir, { recursive: true, force: true });
  console.log(`Deleted project ${projectId}`);
}

export async function getProjectByIdOrUuid(id: string): Promise<{ id: string; port: number }> {
  const projectDir = path.join(PROJECTS_DIR, id);
  try {
    await fs.access(projectDir);
  } catch {
    throw new Error(`Project not found: ${id}`);
  }

  const store = await loadProjectsStore();
  const meta = store[id];
  if (!meta) {
    throw new Error(`Project not found: ${id}`);
  }

  const running = runningProcesses.get(id);
  return {
    id,
    port: running?.port ?? meta.port,
  };
}
