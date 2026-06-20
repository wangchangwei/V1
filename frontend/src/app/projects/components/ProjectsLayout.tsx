"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

interface ProjectsLayoutProps {
  children: ReactNode;
}

export const ProjectsLayout = ({ children }: ProjectsLayoutProps) => {
  return (
    <div className="min-h-screen bg-[#faf9f8] text-[#1a1a1a]">
      <div className="relative">
        <nav className="border-b border-[#e5e5e5] bg-white/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="text-lg text-[#1a1a1a] hover:opacity-80 transition-opacity cursor-pointer font-semibold"
                  style={{ fontFamily: "XSpace, monospace" }}
                >
                  changwei
                </Link>
              </div>

              <div className="flex items-center gap-6">
                <Link
                  href="/projects"
                  className="text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors font-medium"
                >
                  Projects
                </Link>
                <Link
                  href="/templates"
                  className="text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors font-medium"
                >
                  Templates
                </Link>
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-20">{children}</div>

        <footer className="mt-20 pt-12 border-t border-[#e5e5e5] max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between pb-8">
            <div className="text-sm text-[#888888]">
              © 2025 changwei. Build the future, one container at a time.
            </div>
            <div className="flex items-center gap-6 text-sm text-[#888888]">
              <a href="#" className="hover:text-[#1a1a1a] transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-[#1a1a1a] transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-[#1a1a1a] transition-colors">
                Status
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
