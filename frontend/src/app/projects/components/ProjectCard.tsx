"use client";

import { Code, ExternalLink, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Container,
  deleteContainer,
  startContainer,
  stopContainer,
} from "../../../lib/backend/api";

interface ProjectCardProps {
  container: Container;
  onStatusChange: () => void;
}

export const ProjectCard = ({
  container,
  onStatusChange,
}: ProjectCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isRunning = container.status === "running";

  const handleToggleStatus = async () => {
    setIsLoading(true);
    try {
      if (isRunning) {
        await stopContainer(container.id);
      } else {
        await startContainer(container.id);
      }
      onStatusChange();
    } catch (error) {
      console.error("Failed to toggle container status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteContainer(container.id);
      onStatusChange();
    } catch (error) {
      console.error("Failed to delete container:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getProjectName = () => {
    const baseName =
      container.name?.replace("/", "") || `project-${container.id.slice(0, 8)}`;
    return baseName.length > 20 ? baseName.substring(0, 20) + "..." : baseName;
  };

  return (
    <div className="group relative bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-white/5">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div className="relative">
            <img
              className="w-12 h-12 rounded-lg shadow-lg"
              src="/december-logo.png"
              alt="Project Icon"
            />
            <div
              className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-black shadow-lg ${
                isRunning ? "bg-emerald-400" : "bg-gray-400"
              }`}
            ></div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10">
              <div
                className={`w-2 h-2 rounded-full ${
                  isRunning ? "bg-emerald-400 animate-pulse" : "bg-gray-400"
                }`}
              ></div>
              <span className="text-xs text-white/90 font-medium">
                {isRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 backdrop-blur-sm border border-transparent hover:border-red-500/20"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mb-6">
          <h3
            className="text-lg font-semibold text-white mb-2 truncate"
            title={
              container.name?.replace("/", "") ||
              `project-${container.id.slice(0, 8)}`
            }
          >
            {getProjectName()}
          </h3>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
            <p className="text-sm text-white/70 font-medium">
              Next.js Application
            </p>
          </div>
          <p className="text-xs text-white/50">
            Created {formatDate(container.created)}
          </p>
        </div>

        {container.assignedPort && (
          <div className="mb-6 bg-black/20 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Port</span>
              <span className="text-xs font-mono text-white/90">
                :{container.assignedPort}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleStatus}
              disabled={isLoading}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 backdrop-blur-sm border ${
                isRunning
                  ? "bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/20 hover:border-red-400/30"
                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/20 hover:border-emerald-400/30"
              } ${
                isLoading ? "opacity-50 cursor-not-allowed" : "hover:scale-105"
              }`}
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              ) : isRunning ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {isRunning ? "Stop" : "Start"}
            </button>

            {isRunning && (
              <a
                href={`/projects/${container.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-white/30 rounded-lg text-xs font-medium transition-all duration-200 backdrop-blur-sm hover:scale-105"
              >
                <Code className="w-3.5 h-3.5" />
                Open
              </a>
            )}
          </div>

          {container.url && isRunning && (
            <a
              href={container.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white/70 hover:text-white bg-black/20 hover:bg-black/30 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10 hover:border-white/20 hover:scale-105"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-20">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-xl max-w-xs w-full mx-4">
            <h4 className="text-lg font-semibold text-white mb-3">
              Delete Project?
            </h4>
            <p className="text-sm text-white/70 mb-6">
              This action cannot be undone. All project data will be permanently
              removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-sm font-medium transition-all duration-200"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 rounded-lg text-sm font-medium transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
