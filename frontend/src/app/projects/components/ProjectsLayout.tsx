"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface ProjectsLayoutProps {
  children: ReactNode;
}

export const ProjectsLayout = ({ children }: ProjectsLayoutProps) => {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="absolute inset-0 bg-black" />
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-screen object-cover opacity-40"
      >
        <source src="/bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent" />

      <div className="relative">
        <nav className="border-b border-gray-800/50 backdrop-blur-xl bg-black/80 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="text-lg bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer"
                  style={{ fontFamily: "XSpace, monospace" }}
                >
                  DECEMBER
                </Link>
              </div>

              <div className="flex items-center gap-4">
                <Link
                  style={{ fontFamily: "Suisse" }}
                  href="/"
                  className="text-white transition-colors text-sm font-medium"
                >
                  Projects
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-20">{children}</div>

        <footer className="mt-20 pt-12 border-t border-gray-800/50 max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              © 2025 December. Build the future, one container at a time.
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Status
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
