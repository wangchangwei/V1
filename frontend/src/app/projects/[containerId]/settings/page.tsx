"use client";

import { ArrowLeft, Globe, Github, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { use, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { API_BASE_URL, connectGitHub, getProjectGithub, pushToGitHub } from "@/lib/backend/api";

interface SettingsPageProps {
  params: Promise<{ containerId: string }>;
}

export default function SettingsPage({ params }: SettingsPageProps) {
  const { containerId } = use(params);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [vercelToken, setVercelToken] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  // GitHub state
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [connectRepo, setConnectRepo] = useState("");
  const [connectToken, setConnectToken] = useState("");
  const [connectBranch, setConnectBranch] = useState("main");
  const [showConnectToken, setShowConnectToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushToken, setPushToken] = useState("");
  const [showPushToken, setShowPushToken] = useState(false);

  useEffect(() => {
    if (!containerId) return;
    (async () => {
      try {
        const res = await getProjectGithub(containerId);
        if (res.success && res.repo) {
          setGithubConnected(true);
          setGithubRepo(res.repo);
          setGithubBranch(res.branch || "main");
        }
      } catch (err) {
        console.error("Failed to load GitHub config:", err);
      }
    })();
  }, [containerId]);

  const handleDeploy = async () => {
    if (!vercelToken.trim()) return;
    setIsDeploying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/deploy/${containerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vercelToken }),
      });
      const data = await res.json();
      if (data.success) {
        setDeployUrl(data.url);
        toast.success(tc("success"));
      } else {
        toast.error(data.error ?? tc("error"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc("error"));
    } finally {
      setIsDeploying(false);
    }
  };

  const handleConnectGithub = async () => {
    if (!connectRepo.trim() || !connectToken.trim()) return;
    setIsConnecting(true);
    try {
      const res = await connectGitHub(containerId, connectRepo.trim(), connectToken.trim(), connectBranch.trim() || "main");
      if (res.success) {
        toast.success(tc("success"));
        setGithubConnected(true);
        setGithubRepo(connectRepo.trim());
        setGithubBranch(connectBranch.trim() || "main");
        setConnectToken("");
      } else {
        toast.error(res.error ?? tc("error"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc("error"));
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePushToGithub = async () => {
    if (!pushToken.trim() || isPushing) return;
    setIsPushing(true);
    try {
      const res = await pushToGitHub(containerId, githubRepo, pushToken.trim(), githubBranch);
      if (res.success) {
        toast.success(tc("success"));
        setPushToken("");
      } else {
        toast.error(res.error ?? tc("error"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc("error"));
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#faf9f8] text-[#1a1a1a]">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-6">
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
            <span className="text-[#1a1a1a] font-medium">{t("title")}</span>
          </nav>

          <h1 className="text-3xl font-semibold text-[#1a1a1a]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#666666]">{t("subtitle")}</p>
        </header>

        {/* Deploy to Vercel */}
        <section className="bg-white border border-[#e5e5e5] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#1a1a1a]" />
              <h2 className="text-lg font-semibold text-[#1a1a1a]">{t("vercel.title")}</h2>
            </div>
            <Link
              href={`/projects/${containerId}/settings/help`}
              className="text-xs text-[#999999] hover:text-[#1a1a1a] transition-colors underline"
            >
              {t("needHelp")}
            </Link>
          </div>

          {deployUrl ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-600 text-sm">
                {t("vercel.deploySuccess")}
              </div>
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-500 hover:text-blue-600 text-sm"
              >
                {deployUrl}
              </a>
              <button
                onClick={() => { setDeployUrl(null); setVercelToken(""); }}
                className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors"
              >
                {t("vercel.done")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[#666666]">{t("vercel.enterToken")}</p>
              <input
                type="password"
                value={vercelToken}
                onChange={(e) => setVercelToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleDeploy(); }}
                placeholder={t("vercel.placeholder")}
                className="w-full px-3 py-2 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#999999] focus:outline-none focus:border-[#1a1a1a]"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setVercelToken("")}
                  className="px-4 py-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors"
                >
                  {t("vercel.cancel")}
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || !vercelToken.trim()}
                  className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("vercel.deploying")}
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      {t("vercel.deploy")}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* GitHub Connection */}
        <section className="bg-white border border-[#e5e5e5] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Github className="h-5 w-5 text-[#1a1a1a]" />
              <h2 className="text-lg font-semibold text-[#1a1a1a]">{t("github.title")}</h2>
            </div>
            <Link
              href={`/projects/${containerId}/settings/help`}
              className="text-xs text-[#999999] hover:text-[#1a1a1a] transition-colors underline"
            >
              {t("needHelp")}
            </Link>
          </div>

          {githubConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-green-600 text-sm font-medium">{t("github.connected")}</p>
                  <p className="text-green-500/70 text-xs font-mono mt-0.5">{githubRepo} / {githubBranch}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-[#666666] mb-1.5">{t("github.pushLabel")}</label>
                  <div className="relative">
                    <input
                      type={showPushToken ? "text" : "password"}
                      value={pushToken}
                      onChange={(e) => setPushToken(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handlePushToGithub(); }}
                      placeholder={t("github.tokenPlaceholder")}
                      className="w-full px-3 py-2 pr-10 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#999999] focus:outline-none focus:border-[#1a1a1a]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPushToken(!showPushToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999999] hover:text-[#1a1a1a]"
                    >
                      {showPushToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    onClick={handlePushToGithub}
                    disabled={!pushToken.trim() || isPushing}
                    className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isPushing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("github.pushing")}</>
                    ) : (
                      <><Github className="w-3.5 h-3.5" /> {t("github.push")}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#666666]">{t("github.connectPrompt")}</p>
              <div>
                <label className="block text-sm text-[#666666] mb-1.5">{t("github.repoLabel")}</label>
                <input
                  type="text"
                  value={connectRepo}
                  onChange={(e) => setConnectRepo(e.target.value)}
                  placeholder={t("github.repoPlaceholder")}
                  className="w-full px-3 py-2 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#999999] focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#666666] mb-1.5">{t("github.branchLabel")}</label>
                <input
                  type="text"
                  value={connectBranch}
                  onChange={(e) => setConnectBranch(e.target.value)}
                  placeholder={t("github.branchPlaceholder")}
                  className="w-full px-3 py-2 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#999999] focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#666666] mb-1.5">{t("github.tokenLabel")}</label>
                <div className="relative">
                  <input
                    type={showConnectToken ? "text" : "password"}
                    value={connectToken}
                    onChange={(e) => setConnectToken(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConnectGithub(); }}
                    placeholder={t("github.tokenPlaceholder")}
                    className="w-full px-3 py-2 pr-10 bg-[#faf9f8] border border-[#e5e5e5] rounded-lg text-[#1a1a1a] text-sm placeholder:text-[#999999] focus:outline-none focus:border-[#1a1a1a]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConnectToken(!showConnectToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999999] hover:text-[#1a1a1a]"
                  >
                    {showConnectToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <button
                  onClick={handleConnectGithub}
                  disabled={!connectRepo.trim() || !connectToken.trim() || isConnecting}
                  className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg font-medium hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isConnecting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("github.connecting")}</>
                  ) : (
                    <><Github className="w-3.5 h-3.5" /> {t("github.connect")}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Back link */}
        <div className="pt-2">
          <Link
            href={`/projects/${containerId}`}
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
