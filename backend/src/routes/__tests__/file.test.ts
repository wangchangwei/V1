import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import supertest from "supertest";
import fs from "fs/promises";
import path from "path";
import { setupProjectMocks, TEST_PROJECTS_DIR, mockProjectService } from "./mock-project";
import { PROJECTS_DIR } from "../../services/project";

setupProjectMocks();

// Use the same path that the mocked project.ts exports
const CONTAINER_PATH = "/app/my-nextjs-app";
const TEST_PROJECT_ID = "test-file-api-001";

async function createApp() {
  const app = express();
  app.use(express.json());
  const containerRoutes = (await import("../../routes/containers")).default;
  app.use("/containers", containerRoutes);
  return app;
}

async function setupFixture() {
  const projectDir = path.join(PROJECTS_DIR, TEST_PROJECT_ID);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, "app"), { recursive: true });
  await fs.mkdir(path.join(projectDir, "components", "ui"), { recursive: true });

  await fs.writeFile(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "test-fixture", scripts: { dev: "next dev" } }, null, 2)
  );
  await fs.writeFile(
    path.join(projectDir, "app", "layout.tsx"),
    "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }"
  );
  await fs.writeFile(
    path.join(projectDir, "app", "page.tsx"),
    "export default function Page() { return <h1>Hello World</h1>; }"
  );
  await fs.writeFile(
    path.join(projectDir, "components", "Button.tsx"),
    "export const Button = () => <button>Click me</button>;"
  );
  await fs.writeFile(
    path.join(projectDir, "components", "ui", "Card.tsx"),
    "export const Card = ({ title }: { title: string }) => <div>{title}</div>;"
  );
  await fs.writeFile(
    path.join(projectDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }, null, 2)
  );
  await fs.writeFile(
    path.join(projectDir, "README.md"),
    "# Test Project\nThis is a test project."
  );

  return projectDir;
}

describe("File API", () => {
  let app: express.Express;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    // Register fixture project in the mock store so the API can find it
    mockProjectService.createProject(); // populate mock store (first project)
    // Overwrite the first project with our known ID
    const port = 9101;
    mockProjectService.clearAll();
    const { mockStore, runningProcesses } = await import("./mock-project");
    (mockStore as any)[TEST_PROJECT_ID] = { port, createdAt: new Date().toISOString() };
    (runningProcesses as any).set(TEST_PROJECT_ID, true);

    await setupFixture();

    app = await createApp();
    request = supertest(app);
  });

  afterAll(async () => {
    const projectDir = path.join(PROJECTS_DIR, TEST_PROJECT_ID);
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  });

  // --- GET /containers/:id/files ---
  it("GET /containers/:id/files returns file listing", async () => {
    const res = await request.get(`/containers/${TEST_PROJECT_ID}/files`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.files)).toBe(true);
  });

  // --- GET /containers/:id/file-tree ---
  it("GET /containers/:id/file-tree returns hierarchical file tree", async () => {
    const res = await request.get(`/containers/${TEST_PROJECT_ID}/file-tree`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.fileTree)).toBe(true);
  });

  it("file-tree directories come before files and are sorted alphabetically", async () => {
    const res = await request.get(`/containers/${TEST_PROJECT_ID}/file-tree`);
    const items = res.body.fileTree;
    const firstDir = items.find((i: any) => i.type === "directory");
    expect(firstDir).toBeDefined();
    // Check sorting: directories first, then files alphabetically
    const dirs = items.filter((i: any) => i.type === "directory");
    const files = items.filter((i: any) => i.type === "file");
    expect(items.indexOf(firstDir)).toBeLessThan(items.indexOf(files[0]));
  });

  // --- GET /containers/:id/file-content-tree ---
  it("GET /containers/:id/file-content-tree returns tree with content", async () => {
    const res = await request.get(`/containers/${TEST_PROJECT_ID}/file-content-tree`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.fileContentTree)).toBe(true);
  });

  it("file-content-tree includes package.json with content", async () => {
    const res = await request.get(`/containers/${TEST_PROJECT_ID}/file-content-tree`);

    function findFile(tree: any[], name: string): any | null {
      for (const item of tree) {
        if (item.name === name) return item;
        if (item.children) {
          const found = findFile(item.children, name);
          if (found) return found;
        }
      }
      return null;
    }

    const pkg = findFile(res.body.fileContentTree, "package.json");
    expect(pkg).toBeDefined();
    expect(pkg.content).toContain("test-fixture");
  });

  // --- GET /containers/:id/file ---
  it("GET /containers/:id/file returns file content", async () => {
    const res = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/components/Button.tsx` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.content).toBe("export const Button = () => <button>Click me</button>;");
  });

  it("GET /containers/:id/file returns 400 when path is missing", async () => {
    const res = await request.get(`/containers/${TEST_PROJECT_ID}/file`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/path.*required/i);
  });

  it("GET /containers/:id/file returns 500 for non-existent file", async () => {
    const res = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/does-not-exist.tsx` });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  // --- PUT /containers/:id/files ---
  it("PUT /containers/:id/files creates a new file", async () => {
    const newContent = "// New file created by test";
    const res = await request
      .put(`/containers/${TEST_PROJECT_ID}/files`)
      .send({ path: `${CONTAINER_PATH}/new-file.txt`, content: newContent });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const readRes = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/new-file.txt` });
    expect(readRes.body.content).toBe(newContent);
  });

  it("PUT /containers/:id/files overwrites an existing file", async () => {
    const updatedContent = "// Updated by test";
    await request
      .put(`/containers/${TEST_PROJECT_ID}/files`)
      .send({ path: `${CONTAINER_PATH}/components/Button.tsx`, content: updatedContent });

    const res = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/components/Button.tsx` });

    expect(res.body.content).toBe(updatedContent);
  });

  it("PUT /containers/:id/files creates parent directories as needed", async () => {
    const content = "// Nested file";
    const res = await request
      .put(`/containers/${TEST_PROJECT_ID}/files`)
      .send({ path: `${CONTAINER_PATH}/new-dir/nested/file.ts`, content });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const readRes = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/new-dir/nested/file.ts` });
    expect(readRes.body.content).toBe(content);
  });

  // --- PUT /containers/:id/files/rename ---
  it("PUT /containers/:id/files/rename renames a file", async () => {
    await request
      .put(`/containers/${TEST_PROJECT_ID}/files`)
      .send({ path: `${CONTAINER_PATH}/to-rename.txt`, content: "rename me" });

    const res = await request
      .put(`/containers/${TEST_PROJECT_ID}/files/rename`)
      .send({
        oldPath: `${CONTAINER_PATH}/to-rename.txt`,
        newPath: `${CONTAINER_PATH}/renamed.txt`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Old file gone
    const oldRes = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/to-rename.txt` });
    expect(oldRes.status).toBe(500);

    // New file exists
    const newRes = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/renamed.txt` });
    expect(newRes.body.content).toBe("rename me");
  });

  // --- DELETE /containers/:id/files ---
  it("DELETE /containers/:id/files removes a file", async () => {
    await request
      .put(`/containers/${TEST_PROJECT_ID}/files`)
      .send({ path: `${CONTAINER_PATH}/to-delete.txt`, content: "delete me" });

    const delRes = await request
      .delete(`/containers/${TEST_PROJECT_ID}/files`)
      .send({ path: `${CONTAINER_PATH}/to-delete.txt` });

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const verifyRes = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: `${CONTAINER_PATH}/to-delete.txt` });
    expect(verifyRes.status).toBe(500);
  });

  // --- Path traversal protection ---
  it("rejects paths outside project directory", async () => {
    const res = await request
      .get(`/containers/${TEST_PROJECT_ID}/file`)
      .query({ path: "/etc/passwd" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});
