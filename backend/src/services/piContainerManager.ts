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
//
// `runningContainers` is the authoritative in-memory registry. `projects.json`
// stores `piContainerId` and `piPort` only as a recovery hint read once at
// startup by `recoverPiContainers`.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "../config";

const execAsync = promisify(exec);

const PROJECTS_DIR = path.join(process.cwd(), "data");
const PROJECTS_JSON = path.join(PROJECTS_DIR, "projects.json");

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

// Shared secret used to authenticate V1 backend -> pi container requests.
// Lazy-initialized: if PI_SECRET env is unset, generate one per process so
// recovery across restarts produces a fresh secret (containers from a previous
// run become unreachable, which is the safer failure mode).
let activePiSecret: string = config.pi.secret;
export function getPiSecret(): string {
  if (!activePiSecret) {
    activePiSecret = randomBytes(32).toString("hex");
  }
  return activePiSecret;
}

// Shared registry: piProxy.ts looks up containers by projectId.
// This is the authoritative in-memory source for runtime operations.
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
  const { start, size } = config.pi.hostPortRange;
  for (let port = start; port < start + size; port++) {
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
  throw new Error(`No available host port in ${start}-${start + size} range for pi container`);
}

function containerName(projectId: string): string {
  return `v1-pi-${projectId}`;
}

// Wrap a string in single quotes for safe interpolation into a `docker run -e KEY=...`
// shell command. Escapes embedded single quotes by closing, escaping, and reopening.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Returns `docker run -v` flags for shared pi-agent directories.
// Two directories are mounted:
//   1. `.pi-agent-home` → `/home/piagent/.pi/agent` — holds settings.json,
//      auth.json (API keys), and sessions/.
//   2. `.pi-agent-home/.agents` → `/workspace/.agents` — holds the
//      ui-ux-pro-max skill and its data/scripts for UI/UX intelligence.
async function piAgentHomeMount(): Promise<string[]> {
  // Allow override via env var; otherwise look at a default host path.
  const hostDir = process.env.PI_AGENT_HOME ?? path.join(process.cwd(), ".pi-agent-home");
  try {
    await fs.access(hostDir);
    return [
      `-v ${hostDir}:/home/piagent/.pi/agent`,
      `-v ${hostDir}/.agents:/workspace/.agents`,
    ];
  } catch {
    return [];
  }
}

function resolveImage(configIn: PiContainerConfig): string {
  return configIn.image ?? process.env.PI_IMAGE ?? config.pi.image;
}

export async function startPiContainer(
  configIn: PiContainerConfig
): Promise<PiContainerHandle> {
  if (runningContainers.has(configIn.projectId)) {
    throw new Error(`pi container already running for project ${configIn.projectId}`);
  }

  const image = resolveImage(configIn);
  const hostPort = configIn.piPort ?? (await findAvailableHostPort());
  const name = containerName(configIn.projectId);
  const secret = getPiSecret();

  // Idempotent: if a previous container with the same name exists (orphaned
  // or crashed), remove it before launching a fresh one.
  try {
    await execAsync(`docker rm -f ${name}`);
  } catch {
    // Container doesn't exist — fine.
  }

  const { memory, cpus, pidsLimit } = config.pi.containerResources;
  // Forward LLM credentials so pi can make model calls.
  // pi only reads ANTHROPIC_API_KEY (not ANTHROPIC_AUTH_TOKEN), so we remap.
  // Each value is shell-quoted to keep special characters out of the docker CLI.
  const llmEnvFlags: string[] = [];
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
  if (anthropicKey) {
    llmEnvFlags.push(`-e ANTHROPIC_API_KEY=${shellQuote(anthropicKey)}`);
  }
  if (process.env.ANTHROPIC_BASE_URL) {
    llmEnvFlags.push(`-e ANTHROPIC_BASE_URL=${shellQuote(process.env.ANTHROPIC_BASE_URL)}`);
  }

  const cmd = [
    "docker run -d",
    `--name ${name}`,
    `--label v1.project=${configIn.projectId}`,
    `-v ${configIn.projectDir}:/workspace`,
    // Bind-mount a shared pi-agent home so all containers pick up the same
    // settings.json (default model, http proxy, etc.). Optional — if the host
    // directory doesn't exist, pi will use its built-in defaults.
    ...(await piAgentHomeMount()),
    `-p ${hostPort}:${config.pi.internalPort}`,
    `-e PI_SECRET=${secret}`,
    ...llmEnvFlags,
    `--memory=${memory}`,
    `--cpus=${cpus}`,
    `--pids-limit=${pidsLimit}`,
    `--cap-drop=ALL`,
    `--security-opt=no-new-privileges`,
    `--network=bridge`,
    `--restart no`,
    image,
  ].join(" ");

  const { stdout: containerId } = await execAsync(cmd);
  const trimmedId = containerId.trim();

  runningContainers.set(configIn.projectId, {
    containerId: trimmedId,
    hostPort,
    projectId: configIn.projectId,
  });

  await waitForHealthy(trimmedId);

  return { containerId: trimmedId, hostPort, projectId: configIn.projectId };
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
  const { initialWaitMs, retryIntervalMs, maxAttempts } = config.pi.healthCheck;
  await new Promise((resolve) => setTimeout(resolve, initialWaitMs));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isPiContainerHealthy(containerId)) return;
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }
  throw new Error(
    `pi container ${containerId} failed health check after ${maxAttempts} attempts`
  );
}

// On V1 startup, re-attach to any pi containers that survived a restart.
// Containers whose projectId no longer exists in projects.json are kept
// running (orphan preservation — operator cleans them up manually).
//
// Note: a container recovered from a previous process run may carry a stale
// `piPort` hint in projects.json. We trust `docker port` over the hint and
// re-populate runningContainers as the authoritative source.
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
        const m = portOut.match(new RegExp(`${config.pi.internalPort}/tcp -> .*:(\\d+)`));
        if (m) hostPort = Number(m[1]);
      } catch {
        // Container may not be running; skip port discovery.
      }

      if (hostPort === undefined) {
        console.log(`[recover] pi container ${containerId} (project ${projectId}) not listening on ${config.pi.internalPort} — skipping`);
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
