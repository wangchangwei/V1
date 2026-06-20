"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Globe, Github } from "lucide-react";
import { use } from "react";
import { useTranslations } from "next-intl";

interface HelpPageProps {
  params: Promise<{ containerId: string }>;
}

export default function HelpPage({ params }: HelpPageProps) {
  const resolvedParams = use(params) as { containerId: string };
  const { containerId } = resolvedParams;
  const t = useTranslations("help");
  const tc = useTranslations("common");

  return (
    <main className="min-h-screen bg-[#faf9f8] text-[#1a1a1a]">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-10">
        {/* Breadcrumb */}
        <header>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-[#666666] mb-6">
            <Link href="/projects" className="hover:text-[#1a1a1a] transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              {tc("projects")}
            </Link>
            <span className="text-[#cccccc]">/</span>
            <Link href={`/projects/${containerId}`} className="font-mono text-[#999999] hover:text-[#1a1a1a] transition-colors">
              {containerId?.slice(0, 8)}
            </Link>
            <span className="text-[#cccccc]">/</span>
            <Link href={`/projects/${containerId}/settings`} className="hover:text-[#1a1a1a] transition-colors">
              {tc("settings.title")}
            </Link>
            <span className="text-[#cccccc]">/</span>
            <span className="text-[#1a1a1a] font-medium">{t("title")}</span>
          </nav>

          <h1 className="text-3xl font-semibold text-[#1a1a1a]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#666666]">{t("subtitle")}</p>
        </header>

        {/* Vercel Section */}
        <section className="bg-white border border-[#e5e5e5] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-[#1a1a1a]" />
            <h2 className="text-lg font-semibold text-[#1a1a1a]">{t("vercel.title")}</h2>
          </div>

          <div className="space-y-4 text-sm text-[#666666]">
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">1</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("vercel.step1")}</p>
                  <p>{t("vercel.step1Desc")} <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline inline-flex items-center gap-0.5">vercel.com<ExternalLink className="w-3 h-3" /></a></p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">2</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("vercel.step2")}</p>
                  <p>{t("vercel.step2Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">3</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("vercel.step3")}</p>
                  <p>{t("vercel.step3Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">4</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("vercel.step4")}</p>
                  <p>{t("vercel.step4Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">5</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("vercel.step5")}</p>
                  <p>{t("vercel.step5Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">6</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("vercel.step6")}</p>
                  <p>{t("vercel.step6Desc")}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-[#faf9f8] rounded-lg border border-[#e5e5e5]">
              <p className="font-medium text-[#1a1a1a] mb-1">{t("vercel.note")}</p>
              <p>{t("vercel.noteDesc")}</p>
            </div>
          </div>
        </section>

        {/* GitHub Section */}
        <section className="bg-white border border-[#e5e5e5] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Github className="h-5 w-5 text-[#1a1a1a]" />
            <h2 className="text-lg font-semibold text-[#1a1a1a]">{t("github.title")}</h2>
          </div>

          <div className="space-y-4 text-sm text-[#666666]">
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">1</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("github.step1")}</p>
                  <p>{t("github.step1Desc")} <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline inline-flex items-center gap-0.5">github.com/new<ExternalLink className="w-3 h-3" /></a></p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">2</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("github.step2")}</p>
                  <p>{t("github.step2Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">3</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("github.step3")}</p>
                  <p>{t("github.step3Desc")}</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-[#1a1a1a]">
                    <li><strong>repo</strong> — {t("github.step3Scope")}</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">4</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("github.step4")}</p>
                  <p>{t("github.step4Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">5</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("github.step5")}</p>
                  <p>{t("github.step5Desc")}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1a1a1a] text-white text-xs font-medium flex items-center justify-center">6</span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{t("github.step6")}</p>
                  <p>{t("github.step6Desc")}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-[#faf9f8] rounded-lg border border-[#e5e5e5]">
              <p className="font-medium text-[#1a1a1a] mb-1">{t("github.security")}</p>
              <p>{t("github.securityDesc")}</p>
            </div>
          </div>
        </section>

        {/* Back link */}
        <div className="pt-2">
          <Link
            href={`/projects/${containerId}/settings`}
            className="inline-flex items-center gap-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>
        </div>
      </div>
    </main>
  );
}
