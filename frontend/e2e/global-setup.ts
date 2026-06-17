import { request } from "@playwright/test";

const BACKEND_URL = "http://localhost:4002";
const SEED_NAME = `e2e-seed-${Date.now()}`;

export default async function globalSetup() {
  // 1. POST /containers/create to create a project
  const api = await request.newContext({ baseURL: BACKEND_URL });
  const createRes = await api.post("/containers/create", {
    data: { name: SEED_NAME, prompt: "e2e seed project" },
  });
  if (!createRes.ok()) {
    throw new Error(
      `globalSetup: POST /containers/create failed with ${createRes.status()} ${await createRes.text()}`,
    );
  }

  // 2. Wait for the seeded project to appear in GET /containers.
  // The list endpoint exposes the docker-derived name (dec-nextjs-<id>), not the
  // friendly name passed at create time, so we just wait until the list has any
  // container that was created from this call (id matches the create response).
  const deadline = Date.now() + 30_000;
  const { containerId } = (await createRes.json()) as { containerId: string };
  while (Date.now() < deadline) {
    const listRes = await api.get("/containers");
    if (listRes.ok()) {
      const body = await listRes.json();
      const containers = body?.containers ?? [];
      if (containers.some((c: { id?: string }) => c.id === containerId)) {
        await api.dispose();
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await api.dispose();
  throw new Error(`globalSetup: seeded project ${containerId} never appeared in /containers`);
}
