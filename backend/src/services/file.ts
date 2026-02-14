import fs from "fs/promises";
import path from "path";
import { PROJECTS_DIR } from "./project";

const SKIP_DIRS = ["node_modules", ".next"];
const SKIP_FILES_FOR_CONTENT = new Set([
  "bun.lock",
  "package-lock.json",
  "components.json",
  "next-env.d.ts",
  "postcss.config.mjs",
  "favicon.ico",
  ".gitignore",
]);

function getProjectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

function toRelativePath(containerPath: string): string {
  const base = "/app/my-nextjs-app";
  if (containerPath === base || containerPath.startsWith(base + "/")) {
    return containerPath.slice(base.length).replace(/^\//, "") || ".";
  }
  return containerPath.replace(/^\//, "") || ".";
}

function resolveAbsolutePath(projectDir: string, filePath: string): string {
  const relative = toRelativePath(filePath);
  const absolute = path.resolve(projectDir, relative);
  const rel = path.relative(projectDir, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path outside project directory");
  }
  return absolute;
}

export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileItem[];
  content?: string;
}

export interface FileContentItem {
  name: string;
  path: string;
  type: "file" | "directory";
  content?: string;
  children?: FileContentItem[];
}

async function walkDir(
  projectDir: string,
  dirPath: string,
  basePath: string,
  options: { includeContent: boolean; skipUi?: boolean }
): Promise<FileItem[] | FileContentItem[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: (FileItem | FileContentItem)[] = [];

  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".gitignore") continue;
    if (SKIP_DIRS.includes(ent.name)) continue;
    if (options.skipUi && ent.name === "ui" && dirPath.endsWith("components")) continue;

    const fullPath = path.join(dirPath, ent.name);
    const relativePath = path.relative(projectDir, fullPath);
    const pathForApi = basePath + "/" + relativePath.replace(/\\/g, "/");

    if (ent.isDirectory()) {
      const children = await walkDir(projectDir, fullPath, basePath, options);
      const item: FileItem | FileContentItem = {
        name: ent.name,
        path: pathForApi,
        type: "directory",
        children: children as any,
      };
      result.push(item);
    } else {
      if (options.includeContent && SKIP_FILES_FOR_CONTENT.has(ent.name)) continue;
      const item: FileItem | FileContentItem = {
        name: ent.name,
        path: pathForApi,
        type: "file",
      };
      if (options.includeContent) {
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          (item as FileContentItem).content = content.replace(/^\uFEFF/, "");
        } catch {
          (item as FileContentItem).content = "";
        }
      }
      result.push(item);
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export async function getFileTree(
  projectId: string,
  containerPath: string = "/app/my-nextjs-app"
): Promise<FileItem[]> {
  const projectDir = getProjectDir(projectId);
  const absolutePath = resolveAbsolutePath(projectDir, containerPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isDirectory()) {
    return [];
  }
  const basePath = containerPath.replace(/\/$/, "") || "/app/my-nextjs-app";
  const children = await walkDir(projectDir, absolutePath, basePath, {
    includeContent: false,
  });
  return children as FileItem[];
}

export async function getFileContentTree(
  projectId: string,
  containerPath: string = "/app/my-nextjs-app"
): Promise<FileContentItem[]> {
  const projectDir = getProjectDir(projectId);
  const absolutePath = resolveAbsolutePath(projectDir, containerPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isDirectory()) {
    return [];
  }
  const basePath = containerPath.replace(/\/$/, "") || "/app/my-nextjs-app";
  const children = await walkDir(projectDir, absolutePath, basePath, {
    includeContent: true,
    skipUi: true,
  });
  return children as FileContentItem[];
}

export async function readFile(
  projectId: string,
  filePath: string
): Promise<string> {
  const projectDir = getProjectDir(projectId);
  const absolutePath = resolveAbsolutePath(projectDir, filePath);
  const content = await fs.readFile(absolutePath, "utf-8");
  return content.replace(/^\uFEFF/, "");
}

export async function listFiles(
  projectId: string,
  containerPath: string = "/app/my-nextjs-app"
): Promise<any[]> {
  const projectDir = getProjectDir(projectId);
  const absolutePath = resolveAbsolutePath(projectDir, containerPath);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const result: any[] = [];

  for (const ent of entries) {
    if (ent.name === "." || ent.name === "..") continue;
    const fullPath = path.join(absolutePath, ent.name);
    const stat = await fs.stat(fullPath);
    result.push({
      name: ent.name,
      type: stat.isDirectory() ? "directory" : "file",
      permissions: stat.isDirectory() ? "d" : "-",
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }
  return result;
}

export async function writeFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  const projectDir = getProjectDir(projectId);
  const absolutePath = resolveAbsolutePath(projectDir, filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf-8");
}

export async function renameFile(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const projectDir = getProjectDir(projectId);
  const absoluteOld = resolveAbsolutePath(projectDir, oldPath);
  const absoluteNew = resolveAbsolutePath(projectDir, newPath);
  await fs.mkdir(path.dirname(absoluteNew), { recursive: true });
  await fs.rename(absoluteOld, absoluteNew);
}

export async function removeFile(
  projectId: string,
  filePath: string
): Promise<void> {
  const projectDir = getProjectDir(projectId);
  const absolutePath = resolveAbsolutePath(projectDir, filePath);
  await fs.rm(absolutePath, { recursive: true, force: true });
}
