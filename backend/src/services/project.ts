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

async function initializeProjectOnHost(projectId: string): Promise<string> {
  await ensureProjectsDir();
  const projectDir = path.join(PROJECTS_DIR, projectId);

  console.log(`Initializing project on host: ${projectDir}`);

  await fs.mkdir(projectDir, { recursive: true });

  const templateRepo = "https://github.com/ntegrals/december-nextjs-template.git";
  console.log(`Cloning template from ${templateRepo}...`);

  try {
    await execAsync(`git clone --depth 1 "${templateRepo}" temp-template`, {
      cwd: projectDir,
      timeout: 60000,
    });
    console.log("Template cloned successfully");

    const tempDir = path.join(projectDir, "temp-template");
    const files = await fs.readdir(tempDir);

    for (const file of files) {
      if (file === ".git") continue;
      await fs.rename(
        path.join(tempDir, file),
        path.join(projectDir, file)
      );
    }

    await fs.rm(tempDir, { recursive: true, force: true });
    console.log("Template files moved to project directory");
  } catch (error) {
    console.error("Git clone failed:", error);
    throw new Error(
      `Failed to clone template: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log(`Project initialized at ${projectDir}`);
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
  const child = spawn("bun", ["dev"], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  });
  child.unref();
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
      url: port ? `http://localhost:${port}` : null,
      ports: port ? [{ private: 3000, public: port, type: "tcp" }] : [],
      labels: { project: "december", containerId: projectId },
    });
  }

  return result.sort(
    (a, b) =>
      new Date(b.created).getTime() - new Date(a.created).getTime()
  );
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
      url: `http://localhost:${assignedPort}`,
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
    throw new Error(`Port ${port} is in use. Please stop the other process or delete this project.`);
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

  running.process.kill("SIGTERM");
  releasePort(running.port);
  runningProcesses.delete(projectId);
  console.log(`Stopped project ${projectId}, released port ${running.port}`);
}

export async function deleteProject(projectId: string): Promise<void> {
  const running = runningProcesses.get(projectId);
  if (running) {
    running.process.kill("SIGTERM");
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
