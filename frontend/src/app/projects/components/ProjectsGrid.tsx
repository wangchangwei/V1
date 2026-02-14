"use client";

import { Calendar, FolderOpen, MoreHorizontal, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Container,
  deleteContainer,
  getContainers,
  startContainer,
  stopContainer,
} from "../../../lib/backend/api";

export const ProjectsGrid = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dockerError, setDockerError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchContainers = async () => {
    try {
      setError(null);
      setDockerError(null);
      const data = await getContainers();
      setContainers(data.containers);
      if (!data.dockerAvailable && data.error) {
        setDockerError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleProjectCreated = () => {
    fetchContainers();
  };

  const handleStatusChange = () => {
    fetchContainers();
  };

  const handleToggleStatus = async (container: Container) => {
    setActionLoading(container.id);
    try {
      if (container.status === "running") {
        await stopContainer(container.id);
      } else {
        await startContainer(container.id);
      }
      fetchContainers();
    } catch (error) {
      console.error("Failed to toggle container status:", error);
    } finally {
      setActionLoading(null);
      setDropdownOpen(null);
    }
  };

  const handleDeleteContainer = async (container: Container) => {
    setActionLoading(container.id);
    try {
      await deleteContainer(container.id);
      fetchContainers();
    } catch (error) {
      console.error("Failed to delete container:", error);
    } finally {
      setActionLoading(null);
      setDropdownOpen(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-white/70 font-medium">Loading projects...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-6">
        <div className="bg-red-500/10 backdrop-blur-md rounded-2xl border border-red-500/20 p-8 text-center shadow-xl max-w-md">
          <div className="text-red-400 text-xl font-semibold mb-2">
            加载失败
          </div>
          <div className="text-white/60 mb-4">{error}</div>
          <button
            onClick={fetchContainers}
            className="px-6 py-3 bg-white text-black hover:bg-gray-100 rounded-lg transition-all duration-200 font-medium shadow-lg hover:shadow-xl cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="max-w-md mx-auto">
          {dockerError && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-sm">
              {dockerError}
            </div>
          )}
          <div className="w-16 h-16 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-white/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-3">
            No projects yet
          </h3>
          <p className="text-gray-400 mb-6">
            Use the prompt above to create your first project with AI
            assistance.
          </p>
          <button
            onClick={handleProjectCreated}
            className="px-6 py-3 bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-white/30 rounded-lg transition-all duration-200 font-medium backdrop-blur-sm cursor-pointer"
          >
            Create Your First Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {containers.map((container) => (
        <div
          key={container.id}
          className="group relative bg-gray-900/60 hover:bg-gray-800/70 border border-gray-700/50 hover:border-gray-600/70 rounded-lg p-4 transition-all duration-200 backdrop-blur-sm"
        >
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <div
                className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${
                  container.status === "running"
                    ? "bg-green-400"
                    : "bg-gray-500"
                }`}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-white font-medium text-base truncate">
                  {container.name?.replace("/", "") ||
                    `dec-nextjs-${container.id.slice(0, 8)}`}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    container.status === "running"
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                  }`}
                >
                  {container.status === "running" ? "Running" : "Exited"}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Created {formatDate(container.created)}</span>
                </div>
                {container.assignedPort && (
                  <span>Port :{container.assignedPort}</span>
                )}
                <span>Next.js</span>
              </div>
              <div
                className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 font-mono truncate"
                title={`本地目录（用户目录下）: december-projects/${container.id}`}
              >
                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                <span>december-projects/{container.id}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {container.status !== "running" && (
                <button
                  onClick={() => handleToggleStatus(container)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 hover:border-green-500/50 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start
                </button>
              )}

              <a
                href={`/projects/${container.id}`}
                className="px-4 py-1.5 bg-gray-700/50 hover:bg-gray-600/60 text-white border border-gray-600/50 hover:border-gray-500/70 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer"
              >
                Open Project
              </a>

              <div className="relative z-[9999]">
                <button
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md transition-all duration-200 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen(
                      dropdownOpen === container.id ? null : container.id
                    );
                  }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {dropdownOpen === container.id && (
                  <div
                    ref={dropdownRef}
                    className="absolute right-0 top-full mt-1 w-36 bg-gray-800/90 backdrop-blur-xl border border-gray-600/30 rounded-lg shadow-xl z-[9999] py-1"
                  >
                    {container.status === "running" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(container);
                        }}
                        disabled={actionLoading === container.id}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
                      >
                        {actionLoading === container.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(container);
                        }}
                        disabled={actionLoading === container.id}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
                      >
                        {actionLoading === container.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Start
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteContainer(container);
                      }}
                      disabled={actionLoading === container.id}
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
                    >
                      {actionLoading === container.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
