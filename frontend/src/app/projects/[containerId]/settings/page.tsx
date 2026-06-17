"use client";

import { ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";
import { API_BASE_URL } from "@/lib/backend/api";

interface SettingsPageProps {
  params: Promise<{ containerId: string }>;
}

export default function SettingsPage({ params }: SettingsPageProps) {
  const resolvedParams = { containerId: "" };
  void params; // params available via params.containerId when awaited

  const [vercelToken, setVercelToken] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  const containerId =
    typeof window !== "undefined"
      ? window.location.pathname.split("/")[2] ?? ""
      : "";

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
        toast.success("Deployed successfully!");
      } else {
        toast.error(data.error ?? "Deploy failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-6">
        {/* Breadcrumb */}
        <header>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-gray-400 mb-6">
            <Link href="/projects" className="hover:text-white transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Projects
            </Link>
            <span className="text-gray-600">/</span>
            <span className="font-mono text-gray-300">{containerId?.slice(0, 8)}</span>
            <span className="text-gray-600">/</span>
            <span className="text-white font-medium">Settings</span>
          </nav>

          <h1 className="text-3xl font-semibold text-white">Project Settings</h1>
          <p className="mt-1 text-sm text-gray-400">
            Configure integrations and advanced options for this project.
          </p>
        </header>

        {/* Deploy to Vercel */}
        <section className="bg-gray-900/60 border border-gray-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Deploy to Vercel</h2>
          </div>

          {deployUrl ? (
            <div className="space-y-3">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">
                Deployed successfully!
              </div>
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                {deployUrl}
              </a>
              <button
                onClick={() => { setDeployUrl(null); setVercelToken(""); }}
                className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Enter your Vercel token to deploy this project.
              </p>
              <input
                type="password"
                value={vercelToken}
                onChange={(e) => setVercelToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleDeploy(); }}
                placeholder="Vercel token (e.g. xxxxxxxxxx)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600/40 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gray-400"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setVercelToken("")}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || !vercelToken.trim()}
                  className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      Deploy
                    </>
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
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Link>
        </div>
      </div>
    </main>
  );
}
