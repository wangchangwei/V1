// Shared mock state for project.ts — used across all API test files
import path from "path";
import { vi } from "vitest";

export const TEST_PROJECTS_DIR = path.join(process.cwd(), ".test-december-projects");

// Module-level shared store — cleared via mockProjectService.clearAll()
export const mockStore: Record<string, { port: number; createdAt: string }> = {};
export const runningProcesses = new Map<string, boolean>();
let portCounter = 8000;

export const mockProjectService = {
  clearAll() {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
    runningProcesses.clear();
    portCounter = 8000;
  },

  createProject() {
    const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const port = portCounter++;
    mockStore[id] = { port, createdAt: new Date().toISOString() };
    runningProcesses.set(id, true);
    return {
      projectId: id,
      port,
      containerLike: {
        id,
        containerId: id,
        status: "running",
        port,
        url: `http://localhost:${port}`,
        createdAt: mockStore[id].createdAt,
        type: "Next.js App",
      },
    };
  },

  listProjects() {
    const result = [];
    for (const [id, meta] of Object.entries(mockStore)) {
      result.push({
        id,
        dockerId: id,
        name: `dec-nextjs-${id.slice(0, 8)}`,
        status: runningProcesses.has(id) ? "running" : "exited",
        image: "local",
        created: meta.createdAt,
        assignedPort: meta.port,
        url: `http://localhost:${meta.port}`,
        ports: [{ private: 3000, public: meta.port, type: "tcp" }],
        labels: { project: "december", containerId: id },
      });
    }
    return result.sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
    );
  },

  startProject(id: string) {
    if (!mockStore[id]) throw new Error(`Project not found: ${id}`);
    runningProcesses.set(id, true);
    return { port: mockStore[id].port };
  },

  stopProject(id: string) {
    if (!runningProcesses.has(id)) throw new Error(`Project not running: ${id}`);
    runningProcesses.delete(id);
  },

  deleteProject(id: string) {
    if (!mockStore[id]) throw new Error(`Project not found: ${id}`);
    delete mockStore[id];
    runningProcesses.delete(id);
  },

  getProjectByIdOrUuid(id: string) {
    if (!mockStore[id]) throw new Error(`Project not found: ${id}`);
    return { id, port: mockStore[id].port };
  },
};

export function setupProjectMocks() {
  return vi.mock("../../services/project", () => ({
    PROJECTS_DIR: TEST_PROJECTS_DIR,
    createProject: vi.fn(() => mockProjectService.createProject()),
    listProjects: vi.fn(() => mockProjectService.listProjects()),
    startProject: vi.fn((id: string) => mockProjectService.startProject(id)),
    stopProject: vi.fn((id: string) => mockProjectService.stopProject(id)),
    deleteProject: vi.fn((id: string) => mockProjectService.deleteProject(id)),
    getProjectByIdOrUuid: vi.fn((id: string) => mockProjectService.getProjectByIdOrUuid(id)),
    recoverRunningProjects: vi.fn(() => Promise.resolve()),
  }));
}
