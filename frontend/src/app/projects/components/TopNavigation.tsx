"use client";

import {
  ChevronLeft,
  Code2,
  ExternalLink,
  Eye,
  Globe,
  Menu,
  Monitor,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/backend/api";

interface TopNavigationProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  viewMode?: "preview" | "editor";
  setViewMode?: (mode: "preview" | "editor") => void;
  isDesktopView?: boolean;
  setIsDesktopView?: (isDesktop: boolean) => void;
  containerId?: string;
}

export const TopNavigation = ({
  sidebarOpen,
  setSidebarOpen,
  viewMode,
  setViewMode,
  isDesktopView = true,
  setIsDesktopView,
  containerId,
}: TopNavigationProps) => {
  const [containerUrl, setContainerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (containerId) {
      const fetchContainerUrl = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/containers`);
          const data = await response.json();
          if (data.success) {
            const container = data.containers.find(
              (c: any) => c.id === containerId
            );
            if (container && container.url) {
              setContainerUrl(container.url);
            }
          }
        } catch (error) {
          console.error("Error fetching container URL:", error);
        }
      };

      fetchContainerUrl();
      const interval = setInterval(fetchContainerUrl, 10000);
      return () => clearInterval(interval);
    }
  }, [containerId]);

  const handleRefresh = () => {
    const iframe = document.querySelector("iframe");
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const handleExternalLink = () => {
    if (containerUrl) {
      window.open(containerUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-gray-900 border-b border-gray-800">
      <div className="flex h-12 w-full items-center gap-2 px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-2 text-white hover:opacity-80 cursor-pointer"
          >
            <div className="h-5 w-5 bg-gradient-to-br from-purple-500 to-blue-500 rounded"></div>
            <span className="hidden md:block font-medium">c-169675</span>
            {sidebarOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>

        <div
          className="flex-1 flex items-center justify-between"
          style={{ marginLeft: sidebarOpen ? "320px" : "0px" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-1 hover:bg-gray-800 rounded cursor-pointer"
              disabled={!containerUrl}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleExternalLink}
              className="p-1 hover:bg-gray-800 rounded cursor-pointer"
              disabled={!containerUrl}
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {setIsDesktopView && (
              <button
                onClick={() => setIsDesktopView(!isDesktopView)}
                className="flex items-center gap-2 px-3 py-1 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg border border-gray-700/50 backdrop-blur-sm text-gray-400 hover:text-white transition-all duration-200 cursor-pointer"
              >
                {isDesktopView ? (
                  <Monitor className="h-4 w-4" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
              </button>
            )}

            {viewMode && setViewMode && (
              <div className="relative flex items-center bg-gray-800/50 rounded-lg p-1 border border-gray-700/50 backdrop-blur-sm overflow-hidden">
                <div
                  className={`absolute top-1 bottom-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-md transition-all duration-300 ease-out shadow-md ${
                    viewMode === "preview"
                      ? "left-1 w-[calc(50%-2px)]"
                      : "left-[calc(50%+2px)] w-[calc(50%-2px)]"
                  }`}
                />

                <button
                  onClick={() => setViewMode("preview")}
                  className={`relative z-10 flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors duration-200 flex-1 justify-center cursor-pointer ${
                    viewMode === "preview"
                      ? "text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Eye className="w-3 h-3 flex-shrink-0" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={() => setViewMode("editor")}
                  className={`relative z-10 flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors duration-200 flex-1 justify-center cursor-pointer ${
                    viewMode === "editor"
                      ? "text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Code2 className="w-3 h-3 flex-shrink-0" />
                  <span>Code</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm cursor-pointer">
              <Globe className="h-4 w-4" />
              <span className="hidden xl:block">Publish</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
