// pi sidecar container lifecycle manager.
//
// Each project gets one long-lived pi container (`v1-pi-{projectId}`) that
// shares the host project directory at /workspace. V1 owns the lifecycle —
// Docker's restart policy is disabled (`--restart no`) so we always go
// through start/stop here.
//
// Docker is invoked via the `docker` CLI on the host (V1 itself is not
// containerized). Port allocation is host-side: pi uses 9000-9100, separate
// from bun dev's 8000+ range managed by project.ts.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execAsync = promisify(exec);

const PI_PORT_BASE = 9000;
const PI_PORT_RANGE = 100;
const PI_INTERNAL_PORT = 7890;
const DEFAULT_IMAGE = "v1-pi:latest";
const PROJECTS_DIR = path.join(process.cwd(), "data");
const PROJECTS_JSON = path.join(PROJECTS_DIR, "projects.json");

const HEALTH_INITIAL_WAIT_MS = 2000;
const HEALTH_RETRY_INTERVAL_MS = 2000;
const HEALTH_MAX_ATTEMPTS = 5;

export interface PiContainerConfig {
  projectId: string;
  projectDir: string;
  image?: string;
  piPort?: number;
}

export interface PiContainerHandle {
  containerId: string;
  hostPort: number;
  projectId: string;
}

// Shared registry: piProxy.ts looks up containers by projectId.
export const runningContainers: Map<string, PiContainerHandle> = new Map();

interface ProjectsStore {
  [projectId: string]: { port: number; piPort?: number; piContainerId?: string };
}

async function loadProjectsStore(): Promise<ProjectsStore> {
  try {
    const raw = await fs.readFile(PROJECTS_JSON, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function findAvailableHostPort(): Promise<number> {
  for (let port = PI_PORT_BASE; port < PI_PORT_BASE + PI_PORT_RANGE; port++) {
    const inUse = [...runningContainers.values()].some((h) => h.hostPort === port);
    if (inUse) continue;
    try {
      const { stdout } = await execAsync(`lsof -i :${port}`);
      if (stdout.trim() === "") return port;
    } catch {
      // lsof exits non-zero when nothing is listening — port is free.
      return port;
    }
  }
  throw new Error("No available host port in 9000-9100 range for pi container");
}

function containerName(projectId: string): string {
  return `v1-pi-${projectId}`;
}

function resolveImage(config: PiContainerConfig): string {
  return config.image ?? process.env.PI_IMAGE ?? DEFAULT_IMAGE;
}

export async function startPiContainer(
  config: PiContainerConfig
): Promise<PiContainerHandle> {
  if (runningContainers.has(config.projectId)) {
    throw new Error(`pi container already running for project ${config.projectId}`);
  }

  const image = resolveImage(config);
  const hostPort = config.piPort ?? (await findAvailableHostPort());
  const name = containerName(config.projectId);

  // Idempotent: if a previous container with the same name exists (orphaned
  // or crashed), remove it before launching a fresh one.
  try {
    await execAsync(`docker rm -f ${name}`);
  } catch {
    // Container doesn't exist — fine.
  }

  const cmd = [
    "docker run -d",
    `--name ${name}`,
    `--label v1.project=${config.projectId}`,
    `-v ${config.projectDir}:/workspace`,
    `-p ${hostPort}:${PI_INTERNAL_PORT}`,
    `--restart no`,
    image,
  ].join(" ");

  const { stdout: containerId } = await execAsync(cmd);
  const trimmedId = containerId.trim();

  runningContainers.set(config.projectId, {
    containerId: trimmedId,
    hostPort,
    projectId: config.projectId,
  });

  await waitForHealthy(trimmedId);

  return { containerId: trimmedId, hostPort, projectId: config.projectId };
}

export async function stopPiContainer(containerId: string): Promise<void> {
  // Locate the projectId for registry cleanup before removing the container.
  let ownerProjectId: string | undefined;
  for (const [pid, handle] of runningContainers) {
    if (handle.containerId === containerId) {
      ownerProjectId = pid;
      break;
    }
  }

  await execAsync(`docker rm -f ${containerId}`);

  if (ownerProjectId) {
    runningContainers.delete(ownerProjectId);
  }
}

export async function isPiContainerHealthy(containerId: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Health.Status}}' ${containerId}`
    );
    const status = stdout.trim();
    if (status === "healthy" || status === "none") return true;
    return false;
  } catch {
    return false;
  }
}

async function waitForHealthy(containerId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, HEALTH_INITIAL_WAIT_MS));
  for (let attempt = 0; attempt < HEALTH_MAX_ATTEMPTS; attempt++) {
    if (await isPiContainerHealthy(containerId)) return;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_INTERVAL_MS));
  }
  throw new Error(
    `pi container ${containerId} failed health check after ${HEALTH_MAX_ATTEMPTS} attempts`
  );
}

// On V1 startup, re-attach to any pi containers that survived a restart.
// Containers whose projectId no longer exists in projects.json are kept
// running (orphan preservation — operator cleans them up manually).
export async function recoverPiContainers(): Promise<void> {
  const { stdout } = await execAsync(
    `docker ps -a --filter label=v1.project --format '{{.ID}} {{.Label "v1.project"}}'`
  );

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const store = await loadProjectsStore();
  let matched = 0;
  let orphans = 0;

  for (const line of lines) {
    const [containerId, projectId] = line.split(/\s+/);
    if (!containerId || !projectId) continue;

    if (store[projectId]) {
      // Look up the host port from the container's port bindings.
      // `docker port` outputs lines like `9000/tcp -> 0.0.0.0:9001`.
      let hostPort: number | undefined;
      try {
        const { stdout: portOut } = await execAsync(
          `docker port ${containerId}`
        );
        const m = portOut.match(new RegExp(`${PI_INTERNAL_PORT}/tcp -> .*:(\\d+)`));
        if (m) hostPort = Number(m[1]);
      } catch {
        // Container may not be running; skip port discovery.
      }

      if (hostPort === undefined) {
        console.log(`[recover] pi container ${containerId} (project ${projectId}) not listening on ${PI_INTERNAL_PORT} — skipping`);
        continue;
      }

      runningContainers.set(projectId, { containerId, hostPort, projectId });
      matched++;
      console.log(`[recover] pi container ${containerId} re-attached to project ${projectId} on port ${hostPort}`);
    } else {
      orphans++;
      console.log(`[recover] preserving orphan pi container ${containerId} for missing project ${projectId}`);
    }
  }

  console.log(`[recover] pi containers: ${matched} matched, ${orphans} orphan(s) preserved`);
}