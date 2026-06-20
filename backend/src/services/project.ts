import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import {
  startPiContainer,
  stopPiContainer,
  runningContainers,
} from "./piContainerManager";
import { DEFAULT_MODEL, MODELS, type ModelId } from "../config";

// Lazy import E2B to avoid requiring the SDK when not in use
let e2bManager: typeof import("./e2bSandboxManager") | null = null;
async function getE2BManager() {
  if (!e2bManager) {
    e2bManager = await import("./e2bSandboxManager");
  }
  return e2bManager;
}

const execAsync = promisify(exec);

export const PROJECTS_DIR = path.join(os.homedir(), "december-projects");
const BASE_PORT = 8000;
const DATA_DIR = path.join(process.cwd(), "data");
const PROJECTS_JSON = path.join(DATA_DIR, "projects.json");

interface ProjectMeta {
  port: number;
  piPort?: number;
  piContainerId?: string;
  createdAt: string;
  displayName?: string;
  model?: ModelId;
  githubRepo?: string;
  githubBranch?: string;
  vercelUrl?: string;
  useE2B?: boolean;
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
  let raw: string;
  try {
    raw = await fs.readFile(PROJECTS_JSON, "utf-8");
  } catch (err) {
    // ENOENT is the normal "first run" case — empty store.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {};
    }
    console.error(
      "[projects] failed to read projects.json:",
      err instanceof Error ? err.message : err
    );
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Corrupt JSON: preserve the broken file as a .bak so the user can
    // recover by hand, then return an empty store so the app keeps running.
    const backupPath = `${PROJECTS_JSON}.bak-${Date.now()}`;
    try {
      await fs.copyFile(PROJECTS_JSON, backupPath);
      console.warn(
        `[projects] projects.json is corrupt — backed up to ${backupPath}`
      );
    } catch (copyErr) {
      console.error(
        "[projects] projects.json is corrupt and backup failed:",
        copyErr instanceof Error ? copyErr.message : copyErr
      );
    }
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

// Per-project model cache. Mirrors the persistence model: missing field in
// projects.json means "use DEFAULT_MODEL" (do not write the default into the
// store). The cache only stores non-default values to keep that invariant
// observable in the file.
const projectModelCache = new Map<string, ModelId>();

const VALID_MODEL_IDS: ReadonlySet<string> = new Set(MODELS.map((m) => m.id));

// Read the configured model for a project, falling back to the default when
// none is set. The result is cached for hot-path lookups inside chat routes.
// The cache is re-validated against VALID_MODEL_IDS on every read so that
// shrinking the MODELS list (e.g., removing an entry at deploy time) does
// not leave stale IDs in memory.
export async function getProjectModel(projectId: string): Promise<ModelId> {
  const cached = projectModelCache.get(projectId);
  if (cached && VALID_MODEL_IDS.has(cached)) return cached;

  const store = await loadProjectsStore();
  const meta = store[projectId];
  if (meta?.model && VALID_MODEL_IDS.has(meta.model)) {
    projectModelCache.set(projectId, meta.model as ModelId);
    return meta.model as ModelId;
  }
  // Drop any stale cache entry that pointed at a model removed from MODELS.
  if (cached) projectModelCache.delete(projectId);
  return DEFAULT_MODEL;
}

// Persist a per-project model override. Throws 404-style error if the project
// does not exist; the caller is responsible for translating that to an HTTP
// response. Caller should have validated the model ID already; we re-validate
// defensively.
export async function setProjectModel(
  projectId: string,
  modelId: ModelId
): Promise<void> {
  if (!VALID_MODEL_IDS.has(modelId)) {
    throw new Error(`unknown_model: ${modelId}`);
  }
  const store = await loadProjectsStore();
  if (!store[projectId]) {
    throw new Error(`Project not found: ${projectId}`);
  }
  store[projectId].model = modelId;
  await saveProjectsStore(store);
  projectModelCache.set(projectId, modelId);
}

// Clear the cache entry for a project. Called when a project is deleted so a
// subsequent reuse of the same id does not see a stale model.
export function clearProjectModelCache(projectId: string): void {
  projectModelCache.delete(projectId);
}

export async function getProjectGithub(projectId: string): Promise<{ repo?: string; branch?: string }> {
  const store = await loadProjectsStore();
  const meta = store[projectId];
  return { repo: meta?.githubRepo, branch: meta?.githubBranch };
}

export async function setProjectGithub(
  projectId: string,
  repo: string,
  branch: string
): Promise<void> {
  const store = await loadProjectsStore();
  if (!store[projectId]) {
    throw new Error(`Project not found: ${projectId}`);
  }
  store[projectId].githubRepo = repo;
  store[projectId].githubBranch = branch;
  await saveProjectsStore(store);
}

export async function setProjectVercelUrl(
  projectId: string,
  url: string
): Promise<void> {
  const store = await loadProjectsStore();
  if (!store[projectId]) {
    throw new Error(`Project not found: ${projectId}`);
  }
  store[projectId].vercelUrl = url;
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

// Start the execution engine (bun dev or E2B sandbox) for a project.
// Returns the preview URL. Falls back to bun dev if E2B is not enabled.
async function startExecutionEngine(
  projectId: string,
  projectDir: string,
  useE2B: boolean,
  fallbackPort: number
): Promise<{ url: string; type: "bun" | "e2b" }> {
  if (useE2B) {
    try {
      const m = await getE2BManager();
      const handle = await m.startE2BSandbox(projectId);
      return { url: handle.previewUrl, type: "e2b" };
    } catch (err) {
      console.warn(`[project] E2B failed for ${projectId}, falling back to bun dev:`, err);
    }
  }

  // Fallback: bun dev
  const child = runBunDev(projectDir, fallbackPort);
  runningProcesses.set(projectId, { process: child, port: fallbackPort });
  child.on("exit", (code) => {
    runningProcesses.delete(projectId);
    releasePort(fallbackPort);
    if (code !== null && code !== 0) {
      console.log(`Project ${projectId} process exited with code ${code}`);
    }
  });
  return { url: `http://127.0.0.1:${fallbackPort}`, type: "bun" };
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

    let url: string | null = null;
    if (meta.useE2B) {
      // E2B sandbox URL is dynamic — get from manager if running
      try {
        const m = await getE2BManager();
        const h = m.getE2BSandbox(projectId);
        url = h?.previewUrl ?? null;
      } catch (_) {
        url = null;
      }
    } else {
      url = port ? `http://127.0.0.1:${port}` : null;
    }

    result.push({
      id: projectId,
      dockerId: projectId,
      name: `dec-nextjs-${projectId.slice(0, 8)}`,
      status,
      image: "local",
      created: meta.createdAt,
      assignedPort: port,
      url,
      displayName: meta.displayName,
      ports: port ? [{ private: 3000, public: port, type: "tcp" }] : [],
      labels: { project: "december", containerId: projectId },
      githubRepo: meta.githubRepo,
      githubBranch: meta.githubBranch,
      vercelUrl: meta.vercelUrl,
      useE2B: meta.useE2B,
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
  const existing = store[projectId];
  const useE2B = existing?.useE2B ?? false;
  store[projectId] = { ...(existing ?? {}), port: assignedPort, createdAt: new Date().toISOString(), useE2B };
  await saveProjectsStore(store);

  const execResult = await startExecutionEngine(projectId, projectDir, useE2B, assignedPort);

  // Start the pi sidecar container alongside execution engine.
  try {
    const piHandle = await startPiContainer({
      projectId,
      projectDir,
      piPort: store[projectId].piPort,
    });
    store[projectId].piPort = piHandle.hostPort;
    store[projectId].piContainerId = piHandle.containerId;
    await saveProjectsStore(store);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[project] failed to start pi container for ${projectId}:`, msg);
  }

  console.log(`[import] Project ${projectId} running on ${execResult.url} (${execResult.type})`);

  return {
    port: assignedPort,
    containerLike: {
      id: projectId,
      containerId: projectId,
      status: "running",
      port: assignedPort,
      url: execResult.url,
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
  const useE2B = process.env.E2B_DEFAULT_ENABLED === "true";
  store[projectId] = { port: assignedPort, createdAt: new Date().toISOString(), useE2B };
  await saveProjectsStore(store);

  console.log(`Installing dependencies in ${projectDir}...`);
  await runBunInstall(projectDir);

  const execResult = await startExecutionEngine(projectId, projectDir, useE2B, assignedPort);

  // Start the pi sidecar container alongside execution engine. Shares the same
  // projectDir mount so the AI sees the same workspace the user sees.
  try {
    const piHandle = await startPiContainer({
      projectId,
      projectDir,
      piPort: store[projectId].piPort,
    });
    store[projectId].piPort = piHandle.hostPort;
    store[projectId].piContainerId = piHandle.containerId;
    await saveProjectsStore(store);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[project] failed to start pi container for ${projectId}:`, msg);
    // Continue — execution engine is running; user can retry pi via a future endpoint.
  }

  console.log(`Project ${projectId} running on ${execResult.url} (${execResult.type})`);

  return {
    projectId,
    port: assignedPort,
    containerLike: {
      id: projectId,
      containerId: projectId,
      status: "running",
      port: assignedPort,
      url: execResult.url,
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
  if (meta.useE2B) {
    // E2B sandbox — start via E2B manager
    const m = await getE2BManager();
    if (m.hasE2BSandbox(projectId)) {
      return { port };
    }
    await m.startE2BSandbox(projectId);
  } else {
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
  }

  // (Re)start pi sidecar only if no live container is registered.
  // runningContainers is authoritative — recoverPiContainers() populates it
  // at startup, so a still-running container from a previous process is
  // visible here even if its hint was lost from projects.json.
  if (!runningContainers.has(projectId)) {
    try {
      const piHandle = await startPiContainer({ projectId, projectDir });
      meta.piPort = piHandle.hostPort;
      meta.piContainerId = piHandle.containerId;
      await saveProjectsStore(store);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[project] failed to start pi container for ${projectId}:`, msg);
    }
  }

  console.log(`Started project ${projectId} on port ${port}`);
  return { port };
}

export async function stopProject(projectId: string): Promise<void> {
  const running = runningProcesses.get(projectId);
  const store = await loadProjectsStore();
  const meta = store[projectId];

  if (meta?.useE2B) {
    // Stop E2B sandbox
    const m = await getE2BManager();
    await m.stopE2BSandbox(projectId);
  } else {
    if (!running) {
      throw new Error(`Project not running: ${projectId}`);
    }
    try { running.process?.kill("SIGTERM"); } catch (_) {}
    releasePort(running.port);
    runningProcesses.delete(projectId);
  }

  // Tear down pi sidecar if present. runningContainers is the authoritative
  // in-memory registry; projects.json only stores the hint for recovery.
  const piHandle = runningContainers.get(projectId);
  if (piHandle) {
    try {
      await stopPiContainer(piHandle.containerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[project] failed to stop pi container for ${projectId}:`, msg);
    }
  }
  // Clear the recovery hint regardless of stop outcome.
  if (meta) {
    meta.piContainerId = undefined;
    meta.piPort = undefined;
    await saveProjectsStore(store);
  }

  console.log(`Stopped project ${projectId}`);
}

export async function deleteProject(projectId: string): Promise<void> {
  const store = await loadProjectsStore();
  const meta = store[projectId];

  if (meta?.useE2B) {
    const m = await getE2BManager();
    await m.stopE2BSandbox(projectId);
  } else {
    const running = runningProcesses.get(projectId);
    if (running) {
      try { running.process?.kill("SIGTERM"); } catch (_) {}
      releasePort(running.port);
      runningProcesses.delete(projectId);
    }
  }

  // runningContainers is authoritative; stop pi sidecar if present.
  const piHandle = runningContainers.get(projectId);
  if (piHandle) {
    try {
      await stopPiContainer(piHandle.containerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[project] failed to stop pi container for ${projectId}:`, msg);
    }
  }
  delete store[projectId];
  await saveProjectsStore(store);
  clearProjectModelCache(projectId);

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
