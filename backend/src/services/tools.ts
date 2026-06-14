import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat";
import * as fileService from "./file";
import * as packageService from "./package";

export const FORBIDDEN_FILES = new Set([
  ".gitignore",
  "bun.lock",
  "components.json",
  "package-lock.json",
  "package.json",
  "postcss.config.js",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
]);

const writeFileInput = z.object({
  file_path: z.string().describe("Path relative to project root, e.g. 'src/app/page.tsx'"),
  content: z.string().describe("Full file content"),
});

const readFileInput = z.object({
  file_path: z.string().describe("Path relative to project root"),
});

const deleteFileInput = z.object({
  file_path: z.string().describe("Path relative to project root"),
});

const renameFileInput = z.object({
  old_path: z.string().describe("Current path relative to project root"),
  new_path: z.string().describe("New path relative to project root"),
});

const listFilesInput = z.object({
  directory: z
    .string()
    .optional()
    .default("src")
    .describe("Directory relative to project root; defaults to 'src'"),
});

const addDependencyInput = z.object({
  package_name: z.string().describe("NPM package name, e.g. 'lodash' or 'react@18.2.0'"),
  is_dev: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to install as a dev dependency"),
});

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the current contents of a file in the project. Use this to inspect existing code before modifying it.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path relative to project root, e.g. 'src/app/page.tsx'",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or completely overwrite a file. Use this for new files or full replacements. The file_path must not be in the forbidden list (package.json, .gitignore, etc.).",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path relative to project root",
          },
          content: {
            type: "string",
            description: "Full new file content",
          },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or directory from the project.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path relative to project root",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file within the project.",
      parameters: {
        type: "object",
        properties: {
          old_path: {
            type: "string",
            description: "Current path relative to project root",
          },
          new_path: {
            type: "string",
            description: "New path relative to project root",
          },
        },
        required: ["old_path", "new_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and subdirectories inside a directory in the project.",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Directory relative to project root; defaults to 'src'",
            default: "src",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_dependency",
      description:
        "Install an npm package using bun. Use this to add new dependencies to the project. This is the only way to modify package.json.",
      parameters: {
        type: "object",
        properties: {
          package_name: {
            type: "string",
            description: "NPM package name, e.g. 'lodash' or 'react@18.2.0'",
          },
          is_dev: {
            type: "boolean",
            description: "Whether to install as a dev dependency",
            default: false,
          },
        },
        required: ["package_name"],
      },
    },
  },
];

export interface ToolResult {
  ok: boolean;
  output: string;
}

export async function executeTool(
  name: string,
  rawArgs: string,
  projectId: string
): Promise<ToolResult> {
  let args: any;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch (e) {
    return { ok: false, output: `Invalid JSON arguments: ${(e as Error).message}` };
  }

  try {
    switch (name) {
      case "read_file": {
        const parsed = readFileInput.parse(args);
        const content = await fileService.readFile(projectId, parsed.file_path);
        return { ok: true, output: content };
      }
      case "write_file": {
        const parsed = writeFileInput.parse(args);
        const basename = parsed.file_path.split("/").pop() ?? "";
        if (FORBIDDEN_FILES.has(basename) || FORBIDDEN_FILES.has(parsed.file_path)) {
          return {
            ok: false,
            output: `Refused: '${parsed.file_path}' is a protected file. Use add_dependency to modify package.json.`,
          };
        }
        await fileService.writeFile(projectId, parsed.file_path, parsed.content);
        return {
          ok: true,
          output: `Wrote ${parsed.content.length} bytes to ${parsed.file_path}`,
        };
      }
      case "delete_file": {
        const parsed = deleteFileInput.parse(args);
        await fileService.removeFile(projectId, parsed.file_path);
        return { ok: true, output: `Deleted ${parsed.file_path}` };
      }
      case "rename_file": {
        const parsed = renameFileInput.parse(args);
        await fileService.renameFile(
          projectId,
          parsed.old_path,
          parsed.new_path
        );
        return {
          ok: true,
          output: `Renamed ${parsed.old_path} → ${parsed.new_path}`,
        };
      }
      case "list_files": {
        const parsed = listFilesInput.parse(args);
        const files = await fileService.listFiles(
          projectId,
          parsed.directory
        );
        return {
          ok: true,
          output: JSON.stringify(files, null, 2),
        };
      }
      case "add_dependency": {
        const parsed = addDependencyInput.parse(args);
        const output = await packageService.addDependency(
          projectId,
          parsed.package_name,
          parsed.is_dev ?? false
        );
        return {
          ok: true,
          output: output || `Installed ${parsed.package_name}`,
        };
      }
      default:
        return { ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, output: msg };
  }
}
