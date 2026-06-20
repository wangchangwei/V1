"use client";

import Link from "next/link";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useTranslations } from "next-intl";

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient?: string;
}

export const TemplatesPage = () => {
  const t = useTranslations("templates");

  const templates: Template[] = [
    {
      id: "vite-vue",
      name: "极简版 (Vite + Vue 3)",
      description: "最轻量前端骨架，启动快、占用低",
      icon: "/vue-logo.png",
      gradient: "from-emerald-500 to-green-700",
    },
    {
      id: "nextjs",
      name: "Next.js",
      description: "Build full-stack React apps with Next.js",
      icon: "/nextjs-logo.png",
      gradient: "from-black to-gray-800",
    },
    {
      id: "express-react",
      name: "Express & React",
      description: "Node.js backend with React frontend",
      icon: "/express-logo.png",
      gradient: "from-gray-700 to-gray-900",
    },
    {
      id: "express-vue",
      name: "Express & Vue",
      description: "Node.js backend with Vue.js frontend",
      icon: "/vue-logo.png",
      gradient: "from-green-600 to-emerald-800",
    },
    {
      id: "django",
      name: "Django",
      description: "High-level Python web framework",
      icon: "/django-logo.png",
      gradient: "from-blue-600 to-indigo-800",
    },
  ];

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
                  {t("projects")}
                </Link>
                <Link
                  href="/templates"
                  className="text-sm text-[#1a1a1a] hover:text-[#1a1a1a] transition-colors font-medium"
                >
                  {t("templates")}
                </Link>
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-3">{t("title")}</h1>
            <p className="text-[#666666]">
              {t("getStarted")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="group relative bg-white hover:bg-[#faf9f8] border border-[#e5e5e5] hover:border-[#cccccc] rounded-xl p-5 transition-all duration-300 shadow-sm"
              >
                <div className="flex flex-col gap-4">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center shadow-sm overflow-hidden bg-[#faf9f8] border border-[#e5e5e5]">
                    {template.icon.startsWith("/") ? (
                      <img
                        src={template.icon}
                        alt={template.name}
                        className="w-10 h-10 object-contain"
                      />
                    ) : (
                      <span className="text-xl font-bold text-[#1a1a1a]">
                        {template.icon}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#1a1a1a] font-semibold text-lg mb-1 group-hover:text-black transition-colors">
                      {template.name}
                    </h3>
                    <p className="text-[#666666] text-sm group-hover:text-[#444444] transition-colors">
                      {template.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-20 pt-12 border-t border-[#e5e5e5] max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between pb-8">
            <div className="text-sm text-[#888888]">
              {t("footer.copyright")}
            </div>
            <div className="flex items-center gap-6 text-sm text-[#888888]">
              <a href="#" className="hover:text-[#1a1a1a] transition-colors">
                {t("footer.terms")}
              </a>
              <a href="#" className="hover:text-[#1a1a1a] transition-colors">
                {t("footer.privacy")}
              </a>
              <a href="#" className="hover:text-[#1a1a1a] transition-colors">
                {t("footer.status")}
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
