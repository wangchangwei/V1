"use client";

import { Star } from "lucide-react";
import Link from "next/link";

interface CommunityProject {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: string;
  featured?: boolean;
}

export const CommunityPage = () => {
  const featuredProjects: CommunityProject[] = [
    {
      id: "background-paths",
      name: "Background Paths",
      description:
        "Beautiful animated background patterns with customizable colors and shapes",
      icon: "🎨",
      gradient: "from-purple-600 to-pink-600",
      featured: true,
    },
    {
      id: "flowers-saints",
      name: "Flowers & Saints",
      description: "Creative agency portfolio with stunning visual effects",
      icon: "🌸",
      gradient: "from-blue-600 to-purple-600",
      featured: true,
    },
    {
      id: "crypto-dashboard",
      name: "Crypto Dashboard",
      description: "Real-time cryptocurrency trading dashboard with charts",
      icon: "📊",
      gradient: "from-green-500 to-emerald-600",
      featured: true,
    },
  ];

  const handleProjectSelect = (project: CommunityProject) => {
    console.log("Selected project:", project);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/50 via-black to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />

      <div className="relative">
        <nav className="border-b border-gray-800/50 backdrop-blur-xl bg-black/80 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="text-lg bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
                  style={{ fontFamily: "XSpace, monospace" }}
                >
                  DECEMBER
                </span>
              </div>

              <div className="flex items-center gap-4">
                <Link
                  style={{ fontFamily: "Suisse" }}
                  href="/"
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Projects
                </Link>
                <Link
                  style={{ fontFamily: "Suisse" }}
                  href="/community"
                  className="text-white transition-colors text-sm font-medium"
                >
                  Community
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="space-y-8">
            <div className="text-center mb-12">
              <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                Community Projects
              </h1>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                Discover amazing projects built by the December community. Get
                inspired, fork, and build upon the work of others.
              </p>
            </div>

            <div className="mb-12">
              <h2 className="text-xl font-bold text-white mb-6">
                Featured Projects
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredProjects.map((project) => (
                  <div
                    key={`featured-${project.id}`}
                    className="relative group bg-gray-900/60 hover:bg-gray-800/70 border border-gray-700/50 hover:border-gray-600/70 rounded-xl overflow-hidden transition-all duration-300 backdrop-blur-lg cursor-pointer"
                    onClick={() => handleProjectSelect(project)}
                  >
                    <div className="absolute top-3 left-3 z-10">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        <Star className="w-3 h-3 mr-1" />
                        Featured
                      </span>
                    </div>

                    <div
                      className={`h-48 bg-gradient-to-br ${project.gradient} relative overflow-hidden`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-6xl text-white/20">
                          {project.icon}
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-white font-semibold group-hover:text-gray-100 transition-colors">
                          {project.name}
                        </h3>
                      </div>
                      <p className="text-gray-400 text-sm mb-3 group-hover:text-gray-300 transition-colors">
                        {project.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-20 pt-12 border-t border-gray-800/50 max-w-7xl mx-auto px-6">
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
