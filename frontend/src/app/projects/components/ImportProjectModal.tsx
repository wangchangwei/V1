"use client";

import { Github, Upload, X, FolderOpen, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { importFromGitHub, importFromZip } from "@/lib/backend/api";

interface ImportProjectModalProps {
  onClose: () => void;
}

export const ImportProjectModal = ({ onClose }: ImportProjectModalProps) => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"github" | "zip">("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGithubImport = async () => {
    if (!githubUrl.trim() || isLoading) return;
    setIsLoading(true);
    const branchLabel = branch.trim() ? ` (${branch.trim()})` : "";
    const toastId = toast.loading(`正在克隆${branchLabel}...`);
    try {
      const res = await importFromGitHub(githubUrl.trim(), branch.trim() || undefined);
      toast.success("导入成功！正在跳转...", { id: toastId });
      router.push(`/projects/${res.containerId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleZipImport = async () => {
    if (!zipFile || isLoading) return;
    setIsLoading(true);
    const toastId = toast.loading("正在解压并初始化项目...");
    try {
      const res = await importFromZip(zipFile);
      toast.success("导入成功！正在跳转...", { id: toastId });
      router.push(`/projects/${res.containerId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败", { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".zip")) {
      setZipFile(file);
    } else {
      toast.error("请上传 .zip 文件");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* 顶部渐变装饰 */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/50">
          <div>
            <h2 className="text-lg font-semibold text-white">导入项目</h2>
            <p className="text-sm text-gray-400 mt-0.5">从 GitHub 或本地 ZIP 包导入</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-5 gap-2">
          <button
            onClick={() => setTab("github")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "github"
                ? "bg-white/10 text-white border border-white/20"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Github className="w-4 h-4" />
            GitHub
          </button>
          <button
            onClick={() => setTab("zip")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "zip"
                ? "bg-white/10 text-white border border-white/20"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Upload className="w-4 h-4" />
            ZIP 包
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {tab === "github" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">GitHub 仓库地址</label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGithubImport()}
                  placeholder="https://github.com/user/repo 或 user/repo"
                  className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-gray-500/80 transition-all"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  分支
                  <span className="ml-1.5 text-gray-500 font-normal">（可选，默认为仓库默认分支）</span>
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGithubImport()}
                  placeholder="main / dev / feature/xxx"
                  className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-gray-500/80 transition-all"
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-gray-500">
                支持 public 仓库。格式：<code className="text-gray-400">https://github.com/user/repo</code> 或简写 <code className="text-gray-400">user/repo</code>
              </p>
              <button
                onClick={handleGithubImport}
                disabled={!githubUrl.trim() || isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/90 hover:bg-white text-black font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 克隆中...</>
                ) : (
                  <><Github className="w-4 h-4" /> 从 GitHub 导入</>
                )}
              </button>
            </div>
          )}

          {tab === "zip" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-white/40 bg-white/5"
                    : zipFile
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-gray-700/50 hover:border-gray-600/60 hover:bg-white/[0.02]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setZipFile(f);
                  }}
                />
                {zipFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FolderOpen className="w-8 h-8 text-green-400" />
                    <p className="text-sm text-white font-medium">{zipFile.name}</p>
                    <p className="text-xs text-gray-400">
                      {(zipFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setZipFile(null); }}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors mt-1"
                    >
                      移除
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-500" />
                    <p className="text-sm text-gray-300">拖拽 ZIP 文件到此处，或点击选择</p>
                    <p className="text-xs text-gray-500">仅支持 .zip 格式</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleZipImport}
                disabled={!zipFile || isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/90 hover:bg-white text-black font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 导入中...</>
                ) : (
                  <><Upload className="w-4 h-4" /> 导入 ZIP 包</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
