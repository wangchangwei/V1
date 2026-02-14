"use client";

import { Save, Search, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { FileTree } from "./components/FileTree";
import Sidebar from "./components/Sidebar";
import { Code } from "./utils/Code";
import { Directory, File, Type } from "./utils/FileManager";
import { API_BASE_URL } from "@/lib/backend/api";

interface CodeEditorProps {
  containerId: string;
}

interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileItem[];
  content?: string;
}

interface OpenTab {
  file: File;
  isDirty: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ containerId }) => {
  const [rootDir, setRootDir] = useState<Directory | null>(null);
  const [filteredDir, setFilteredDir] = useState<Directory | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");

  const activeFile =
    activeTabIndex >= 0 ? openTabs[activeTabIndex]?.file : undefined;

  useEffect(() => {
    const fetchFileTree = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/containers/${containerId}/file-tree`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch file tree");
        }

        const data = await response.json();

        if (data.success) {
          const directory = convertToDirectory(data.fileTree);
          setRootDir(directory);
          setFilteredDir(directory);
        }
      } catch (error) {
        console.error("Error fetching file tree:", error);
        const errorDir: Directory = {
          id: "error",
          name: "Error loading files",
          type: Type.DIRECTORY,
          parentId: undefined,
          depth: 0,
          dirs: [],
          files: [
            {
              id: "error-file",
              name: "error.txt",
              type: Type.FILE,
              parentId: "error",
              depth: 1,
              content:
                "Error: Could not load container files. Please ensure the container is running.",
            },
          ],
        };
        setRootDir(errorDir);
        setFilteredDir(errorDir);
      } finally {
        setIsLoading(false);
      }
    };

    if (containerId) {
      fetchFileTree();
    }
  }, [containerId]);

  useEffect(() => {
    if (!rootDir || !searchQuery.trim()) {
      setFilteredDir(rootDir);
      return;
    }

    const filterDirectory = (dir: Directory): Directory | null => {
      const filteredFiles = dir.files.filter((file) =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      const filteredDirs = dir.dirs
        .map((subDir) => filterDirectory(subDir))
        .filter((subDir): subDir is Directory => subDir !== null);

      const matchingDirs = dir.dirs.filter((subDir) =>
        subDir.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      const allFilteredDirs = [
        ...filteredDirs,
        ...matchingDirs.filter(
          (matchingDir) =>
            !filteredDirs.some((filtered) => filtered.id === matchingDir.id)
        ),
      ];

      if (filteredFiles.length === 0 && allFilteredDirs.length === 0) {
        return null;
      }

      return {
        ...dir,
        files: filteredFiles,
        dirs: allFilteredDirs,
      };
    };

    const filtered = filterDirectory(rootDir);
    setFilteredDir(filtered);
  }, [rootDir, searchQuery]);

  const convertToDirectory = (
    fileItems: FileItem[],
    parentId?: string,
    depth: number = 0
  ): Directory => {
    const rootDir: Directory = {
      id: parentId || "root",
      name: "my-nextjs-app",
      type: Type.DIRECTORY,
      parentId: undefined,
      depth: 0,
      dirs: [],
      files: [],
    };

    const processItems = (
      items: FileItem[],
      parent: Directory,
      currentDepth: number
    ) => {
      items.forEach((item) => {
        if (item.type === "directory" && item.children) {
          const dir: Directory = {
            id: item.path,
            name: item.name,
            type: Type.DIRECTORY,
            parentId: parent.id,
            depth: currentDepth + 1,
            dirs: [],
            files: [],
          };
          parent.dirs.push(dir);
          processItems(item.children, dir, currentDepth + 1);
        } else if (item.type === "file") {
          const file: File = {
            id: item.path,
            name: item.name,
            type: Type.FILE,
            parentId: parent.id,
            depth: currentDepth + 1,
            content: "",
            path: item.path,
          };
          parent.files.push(file);
        }
      });
    };

    processItems(fileItems, rootDir, depth);
    return rootDir;
  };

  const loadFileContent = async (file: File) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/containers/${containerId}/file?path=${encodeURIComponent(
          file.path || file.id
        )}`
      );

      if (!response.ok) {
        throw new Error("Failed to load file content");
      }

      const data = await response.json();
      if (data.success) {
        file.content = data.content;
      }
    } catch (error) {
      console.error("Error loading file content:", error);
      file.content = "Error loading file content";
    }
  };

  const onSelect = async (file: File) => {
    const existingTabIndex = openTabs.findIndex(
      (tab) => tab.file.id === file.id
    );

    if (existingTabIndex >= 0) {
      setActiveTabIndex(existingTabIndex);
      return;
    }

    if (!file.content && file.path) {
      await loadFileContent(file);
    }

    const newTab: OpenTab = { file, isDirty: false };
    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTabIndex(openTabs.length);
    setSaveStatus("idle");
  };

  const closeTab = (index: number) => {
    setOpenTabs((prev) => prev.filter((_, i) => i !== index));

    if (activeTabIndex === index) {
      setActiveTabIndex(index > 0 ? index - 1 : openTabs.length > 1 ? 0 : -1);
    } else if (activeTabIndex > index) {
      setActiveTabIndex((prev) => prev - 1);
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    if (activeFile && value !== undefined) {
      activeFile.content = value;

      setOpenTabs((prev) =>
        prev.map((tab, index) =>
          index === activeTabIndex ? { ...tab, isDirty: true } : tab
        )
      );
    }
  };

  const handleSave = async () => {
    if (!activeFile || !activeFile.path) return;

    setSaveStatus("saving");
    setIsSaving(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/containers/${containerId}/files`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: activeFile.path,
            content: activeFile.content,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setSaveStatus("error");
        throw new Error(data.error || "Failed to save file");
      }

      if (data.success) {
        setSaveStatus("success");
        setOpenTabs((prev) =>
          prev.map((tab, index) =>
            index === activeTabIndex ? { ...tab, isDirty: false } : tab
          )
        );

        setTimeout(() => {
          setSaveStatus("idle");
        }, 2000);
      }
    } catch (error) {
      console.error("Error saving file:", error);
      setSaveStatus("error");

      setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (activeFile) {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-white/70 font-medium">Loading files...</span>
        </div>
      </div>
    );
  }

  if (!rootDir) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="text-white/70">No files found</div>
      </div>
    );
  }

  return (
    <div className="h-full p-6 relative z-10">
      <div className="h-full bg-gray-900/40 backdrop-blur-sm rounded-xl border border-gray-800/40 overflow-hidden shadow-2xl shadow-black/20 flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {openTabs.length > 0 && (
              <div className="flex items-center gap-0 bg-gray-900 rounded-md overflow-x-auto flex-1 min-w-0">
                {openTabs.map((tab, index) => (
                  <div
                    key={tab.file.id}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors border-r border-gray-700 last:border-r-0 min-w-0 ${
                      index === activeTabIndex
                        ? "bg-gray-950 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                    onClick={() => setActiveTabIndex(index)}
                  >
                    <span className="truncate">
                      {tab.file.name}
                      {tab.isDirty && (
                        <span className="text-orange-400 ml-1">•</span>
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(index);
                      }}
                      className="text-gray-500 hover:text-white hover:bg-gray-700 rounded p-0.5 flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!activeFile || isSaving}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 ${
              activeFile && !isSaving
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            } ${
              saveStatus === "success"
                ? "bg-green-600 hover:bg-green-700"
                : saveStatus === "error"
                ? "bg-red-600 hover:bg-red-700"
                : ""
            }`}
            title={activeFile ? "Save file (Ctrl+S)" : "No file selected"}
          >
            {saveStatus === "saving" ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : saveStatus === "success" ? (
              <>
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  ></path>
                </svg>
                <span>Saved!</span>
              </>
            ) : saveStatus === "error" ? (
              <>
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L10 9.414l1.293-1.293a1 1 0 011.414 1.414L11.414 10l1.293 1.293a1 1 0 01-1.414 1.414L10 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L9.414 10 8.121 8.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  ></path>
                </svg>
                <span>Error</span>
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>

        <main className="flex flex-1 min-h-0">
          <Sidebar>
            <div className="p-2 border-b border-gray-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800 text-white placeholder-gray-400 border border-gray-600 rounded text-xs pl-8 pr-2.5 py-1.5 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredDir && (
                <FileTree
                  rootDir={filteredDir}
                  selectedFile={activeFile}
                  onSelect={onSelect}
                />
              )}
            </div>
          </Sidebar>
          <Code selectedFile={activeFile} onChange={handleCodeChange} />
        </main>
      </div>
    </div>
  );
};

export default CodeEditor;
