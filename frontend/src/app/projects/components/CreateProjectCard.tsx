"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createContainer } from "../../../lib/backend/api";

interface CreateProjectCardProps {
  onProjectCreated: () => void;
}

export const CreateProjectCard = ({
  onProjectCreated,
}: CreateProjectCardProps) => {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async () => {
    setIsCreating(true);
    try {
      await createContainer();
      onProjectCreated();
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      onClick={handleCreateProject}
      className="group relative bg-white/5 backdrop-blur-sm border-1 border-dashed border-white/20 rounded-xl p-6 hover:bg-white/[0.08] hover:border-white/30 transition-all duration-300 cursor-pointer min-h-[240px] flex flex-col items-center justify-center shadow-lg hover:shadow-2xl hover:shadow-white/5"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      <div className="relative z-10 flex flex-col items-center">
        {isCreating ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-xl animate-pulse opacity-30"></div>
            </div>
            <div className="text-center">
              <span className="text-lg font-semibold text-white mb-2 block">
                Creating project... (the first time will take a bit longer due
                to container setup)
              </span>
              <span className="text-sm text-white/60">
                Setting up your container
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-white/70 group-hover:text-white transition-colors duration-300">
            <div className="relative group-hover:scale-110 transition-transform duration-300">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:shadow-purple-500/30 transition-all duration-300">
                <Plus className="w-7 h-7 text-white" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 animate-pulse"></div>
            </div>
            <div className="text-center">
              <span className="text-lg font-semibold mb-2 block text-white">
                Create New Project
              </span>
              <span className="text-sm text-center leading-relaxed text-white/70">
                Start a new Next.js application
                <br />
                <span className="text-white/50">
                  with Docker containerization
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
