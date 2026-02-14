//@ts-nocheck
import {
  ChevronLeft,
  ExternalLink,
  Globe,
  Menu,
  Monitor,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

export const TopNavigation = ({ sidebarOpen, setSidebarOpen }) => {
  const [isDesktopView, setIsDesktopView] = useState(true);
  return (
    <div className="sticky top-0 z-50 w-full bg-gray-900 border-b border-gray-800">
      <nav className="flex h-12 w-full items-center gap-2 px-4">
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

        <div className="flex items-center gap-2 ml-4">
          <button className="p-1 hover:bg-gray-800 rounded cursor-pointer">
            <RefreshCw className="h-4 w-4" />
          </button>
          <a href="#" className="p-1 hover:bg-gray-800 rounded cursor-pointer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg border border-gray-700 min-w-[200px]">
            <button
              onClick={() => setIsDesktopView(!isDesktopView)}
              className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              {isDesktopView ? (
                <Monitor className="h-4 w-4" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
            </button>
            <span className="text-sm">Home</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm cursor-pointer">
            <Globe className="h-4 w-4" />
            <span className="hidden xl:block">Publish</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
