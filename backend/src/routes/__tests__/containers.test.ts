import { describe, it, expect, beforeAll, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";
import { setupProjectMocks, mockProjectService } from "./mock-project";

setupProjectMocks();

async function createApp() {
  const app = express();
  app.use(express.json());
  const containerRoutes = (await import("../../routes/containers")).default;
  app.use("/containers", containerRoutes);
  return app;
}

describe("Containers API", () => {
  let app: express.Express;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    app = await createApp();
    request = supertest(app);
  });

  afterEach(() => {
    mockProjectService.clearAll();
  });

  // --- GET /containers ---
  it("GET /containers returns empty list when no projects exist", async () => {
    const res = await request.get("/containers");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.containers).toEqual([]);
  });

  // --- POST /containers/create ---
  it("POST /containers/create creates a project and returns container info", async () => {
    const res = await request.post("/containers/create");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.containerId).toBeDefined();
    expect(res.body.container).toMatchObject({
      status: "running",
      type: "Next.js App",
    });
    expect(res.body.container.port).toBeGreaterThan(0);
    expect(res.body.container.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it("POST /containers/create returns containerId matching container.containerId", async () => {
    const res = await request.post("/containers/create");
    expect(res.body.containerId).toBe(res.body.container.containerId);
  });

  // --- GET /containers (list) ---
  it("GET /containers lists created projects", async () => {
    await request.post("/containers/create");
    await request.post("/containers/create");

    const res = await request.get("/containers");
    expect(res.status).toBe(200);
    expect(res.body.containers).toHaveLength(2);
  });

  it("GET /containers returns projects with correct structure", async () => {
    await request.post("/containers/create");

    const res = await request.get("/containers");
    const project = res.body.containers[0];

    expect(project).toMatchObject({
      id: expect.any(String),
      dockerId: expect.any(String),
      name: expect.stringContaining("dec-nextjs-"),
      status: expect.stringMatching(/running|exited/),
      image: "local",
      assignedPort: expect.any(Number),
      url: expect.stringMatching(/^http:\/\/localhost:\d+$/),
    });
  });

  // --- POST /containers/:id/stop ---
  it("POST /containers/:id/stop stops a running project", async () => {
    const createRes = await request.post("/containers/create");
    const containerId = createRes.body.containerId;

    const stopRes = await request.post(`/containers/${containerId}/stop`);
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.success).toBe(true);
    expect(stopRes.body.status).toBe("stopped");
    expect(stopRes.body.containerId).toBe(containerId);
  });

  it("POST /containers/:id/stop returns 500 for non-existent project", async () => {
    const res = await request.post("/containers/does-not-exist/stop");
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  // --- POST /containers/:id/start ---
  it("POST /containers/:id/start starts a stopped project", async () => {
    const createRes = await request.post("/containers/create");
    const containerId = createRes.body.containerId;

    await request.post(`/containers/${containerId}/stop`);

    const startRes = await request.post(`/containers/${containerId}/start`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.success).toBe(true);
    expect(startRes.body.status).toBe("running");
    expect(startRes.body.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it("POST /containers/:id/start returns project info with message", async () => {
    const createRes = await request.post("/containers/create");
    const containerId = createRes.body.containerId;
    await request.post(`/containers/${containerId}/stop`);

    const res = await request.post(`/containers/${containerId}/start`);
    expect(res.body).toMatchObject({
      containerId,
      status: "running",
      message: expect.stringContaining("started"),
    });
  });

  // --- DELETE /containers/:id ---
  it("DELETE /containers/:id deletes a project", async () => {
    const createRes = await request.post("/containers/create");
    const containerId = createRes.body.containerId;

    const delRes = await request.delete(`/containers/${containerId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const listRes = await request.get("/containers");
    expect(listRes.body.containers.some((c: any) => c.id === containerId)).toBe(false);
  });

  it("DELETE /containers/:id returns 500 for non-existent project", async () => {
    const res = await request.delete("/containers/does-not-exist");
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
