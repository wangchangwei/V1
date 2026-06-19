import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { __resetLocksForTests } from "../../services/locks";

// Module-level shared store — pre-populated by each test
const mockStore: Record<string, { port: number; createdAt: string }> = {};

const mockProjectService = {
  getProjectByIdOrUuid(id: string) {
    if (!mockStore[id]) throw new Error(`Project not found: ${id}`);
    return { id, port: mockStore[id]!.port };
  },
};

vi.mock("../../services/project", () => ({
  PROJECTS_DIR: "/tmp/dec-test",
  createProject: vi.fn(),
  listProjects: vi.fn(),
  startProject: vi.fn(),
  stopProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectByIdOrUuid: vi.fn((id: string) => mockProjectService.getProjectByIdOrUuid(id)),
  recoverRunningProjects: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  deployToVercel: vi.fn(),
}));

vi.mock("../../services/deploy", () => ({
  deployToVercel: mocks.deployToVercel,
}));

import deployRouter from "../deploy";

const app = express();
app.use(express.json());
app.use("/deploy", deployRouter);

const CID = "deploy-test-cid";

beforeEach(() => {
  // Pre-populate the store so getProjectByIdOrUuid finds the project
  mockStore[CID] = { port: 9000, createdAt: new Date().toISOString() };
  __resetLocksForTests();
  mocks.deployToVercel.mockReset();
  mocks.deployToVercel.mockResolvedValue({
    url: "https://my-project.vercel.app",
    deploymentId: "dpl_abc123",
    status: "deployed",
  });
});

afterEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  __resetLocksForTests();
});

describe("POST /deploy/:containerId", () => {
  it("returns 400 when vercelToken is missing", async () => {
    await request(app)
      .post(`/deploy/${CID}`)
      .send({})
      .expect(400, { success: false, error: "vercelToken is required" });
  });

  it("returns 400 when vercelToken is empty string", async () => {
    await request(app)
      .post(`/deploy/${CID}`)
      .send({ vercelToken: "   " })
      .expect(400, { success: false, error: "vercelToken is required" });
  });

  it("returns 400 when vercelToken is not a string", async () => {
    await request(app)
      .post(`/deploy/${CID}`)
      .send({ vercelToken: 12345 })
      .expect(400, { success: false, error: "vercelToken is required" });
  });

  it("returns 200 and deploy URL on success", async () => {
    const res = await request(app)
      .post(`/deploy/${CID}`)
      .send({ vercelToken: "vk1_abc123xyz" })
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      url: "https://my-project.vercel.app",
      deploymentId: "dpl_abc123",
      status: "deployed",
    });
  });

  it("calls deployToVercel with projectId and trimmed token", async () => {
    await request(app)
      .post(`/deploy/${CID}`)
      .send({ vercelToken: "  vk1_abc123xyz  " })
      .expect(200);

    expect(mocks.deployToVercel).toHaveBeenCalledWith(CID, "vk1_abc123xyz");
  });

  it("returns 500 and error message when deploy throws", async () => {
    mocks.deployToVercel.mockRejectedValue(new Error("Vercel rate limit exceeded"));

    const res = await request(app)
      .post(`/deploy/${CID}`)
      .send({ vercelToken: "vk1_bad" })
      .expect(500);

    expect(res.body).toEqual({
      success: false,
      error: "Vercel rate limit exceeded",
    });
  });

  it("returns 500 for non-Error throws", async () => {
    mocks.deployToVercel.mockRejectedValue("string error");

    const res = await request(app)
      .post(`/deploy/${CID}`)
      .send({ vercelToken: "vk1_bad" })
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeTruthy();
  });
});
