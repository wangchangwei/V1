"use client";

import { useEffect, useState } from "react";
import { Container, getContainers } from "../../../lib/backend/api";

interface LivePreviewProps {
  containerId: string;
  isDesktopView?: boolean;
}

export const LivePreview = ({
  containerId,
  isDesktopView = true,
}: LivePreviewProps) => {
  const [container, setContainer] = useState<Container | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContainer = async () => {
      try {
        setError(null);
        const { containers } = await getContainers();
        const foundContainer = containers.find((c) => c.id === containerId);

        if (!foundContainer) {
          setError("Container not found");
          return;
        }

        setContainer(foundContainer);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch container"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchContainer();
    const interval = setInterval(fetchContainer, 5000);
    return () => clearInterval(interval);
  }, [containerId]);

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gray-800/60 backdrop-blur-sm rounded-lg border border-gray-700/40 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700/10 via-transparent to-gray-600/10 rounded-lg" />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/70 font-medium">Loading preview...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-gray-800/60 backdrop-blur-sm rounded-lg border border-gray-700/40 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700/10 via-transparent to-gray-600/10 rounded-lg" />
        <div className="text-center relative z-10">
          <div className="text-red-400 text-lg font-semibold mb-2">
            Preview Error
          </div>
          <div className="text-white/60">{error}</div>
        </div>
      </div>
    );
  }

  if (!container) {
    return (
      <div className="w-full h-full bg-gray-800/60 backdrop-blur-sm rounded-lg border border-gray-700/40 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700/10 via-transparent to-gray-600/10 rounded-lg" />
        <div className="text-center relative z-10">
          <div className="text-white/60 text-lg">Container not found</div>
        </div>
      </div>
    );
  }

  if (container.status !== "running" || !container.url) {
    return (
      <div className="w-full h-full bg-gray-800/60 backdrop-blur-sm rounded-lg border border-gray-700/40 flex items-center justify-center relative">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700/10 via-transparent to-gray-600/10 rounded-lg" />
        <div className="text-center max-w-md relative z-10">
          <div className="w-16 h-16 bg-gray-700/60 backdrop-blur-sm rounded-full mx-auto mb-6 flex items-center justify-center border border-gray-600/40 shadow-sm">
            <svg
              className="w-8 h-8 text-white/50"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">
            Container Not Running
          </h1>
          <p className="text-white/60 mb-6">
            Start the container to see the live preview
          </p>
          <div className="text-sm text-white/40 bg-gray-700/40 backdrop-blur-sm px-3 py-2 rounded-lg border border-gray-600/40">
            Status: <span className="font-mono">{container.status}</span>
          </div>
        </div>
      </div>
    );
  }

  const previewContainer = (
    <div className="w-full h-full bg-white rounded-lg border border-zinc-300/20 overflow-hidden shadow-2xl relative">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/2" />
      <div className="bg-zinc-100/20 backdrop-blur-sm border-b border-zinc-300/20 px-4 py-3 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full shadow-sm"></div>
          <div className="w-3 h-3 bg-yellow-500 rounded-full shadow-sm"></div>
          <div className="w-3 h-3 bg-green-500 rounded-full shadow-sm"></div>
        </div>
        <div className="text-sm text-zinc-600 font-mono bg-white/80 backdrop-blur-sm px-3 py-1 rounded border border-zinc-300/30 shadow-sm">
          {container.url}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-sm"></div>
          <span className="text-xs text-zinc-600 font-medium">Live</span>
        </div>
      </div>
      <iframe
        src={container.url}
        className="w-full h-full border-0 relative z-10"
        title={`Preview of ${container.name || container.id}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );

  if (isDesktopView) {
    return previewContainer;
  }

  return (
    <div className="w-full h-full bg-zinc-900/20 flex items-center justify-center p-6">
      <div
        className="bg-gray-800 rounded-[2.5rem] p-3 shadow-2xl border border-gray-700/50 relative"
        style={{
          width: "320px",
          height: "680px",
          maxHeight: "calc(100vh - 140px)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-600/10 via-transparent to-gray-700/10 rounded-[2.5rem]" />
        <div className="w-full h-full bg-transparent rounded-[1.8rem] overflow-hidden relative z-10">
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-28 h-5 bg-gray-800 rounded-b-2xl z-10"></div>

          <div className="w-full h-full">
            <iframe
              src={container.url}
              className="w-full h-full border-0 rounded-[1.8rem]"
              title={`Mobile Preview of ${container.name || container.id}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
