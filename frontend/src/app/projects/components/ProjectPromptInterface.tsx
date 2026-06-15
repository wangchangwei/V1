"use client";

import { Paperclip, Palette, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { createContainer, enrichPrompt, getModels, Model } from "../../../lib/backend/api";
import { STYLES, findStyleByName } from "../../../lib/styles";
import { useTranslations } from "next-intl";

interface ProjectPromptInterfaceProps {
  selectedTemplate: string;
  onTemplateChange: (template: string) => void;
}

export const ProjectPromptInterface = ({
  selectedTemplate,
  onTemplateChange,
}: ProjectPromptInterfaceProps) => {
  const t = useTranslations("home");
  const ts = useTranslations("styles");
  const [promptInput, setPromptInput] = useState("");
  const [isCreatingFromPrompt, setIsCreatingFromPrompt] = useState(false);
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [modelOptions, setModelOptions] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("Default");
  const router = useRouter();

  useEffect(() => {
    getModels()
      .then((models) => {
        setModelOptions(models);
        if (models.length > 0) {
          setSelectedModel(models[0]);
        }
      })
      .catch(() => {});
  }, []);

  const handlePromptSubmit = async () => {
    if (!promptInput.trim() || isCreatingFromPrompt) return;

    setIsCreatingFromPrompt(true);

    toast("Creating new project...", {
      icon: "🚀",
      duration: 3000,
    });

    try {
      const containerResponse = await createContainer();
      const containerId = containerResponse.containerId;

      toast.success("Project created! Redirecting...", {
        duration: 2000,
      });

      router.push(
        `/projects/${containerId}?prompt=${encodeURIComponent(
          promptInput.trim()
        )}&model=${encodeURIComponent(selectedModel?.id ?? "")}&style=${encodeURIComponent(selectedStyle)}`
      );
    } catch (error) {
      console.error("Failed to create project from prompt:", error);
      toast.error("Failed to create project. Please try again.");
    } finally {
      setIsCreatingFromPrompt(false);
    }
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handlePromptSubmit();
    }
  };

  const communityOptions = [
    "Next.js",
    "Express & React",
    "Express & Vue",
    "Django",
  ];

  const handleCommunitySelect = (option: string) => {
    onTemplateChange(option);
    setShowCommunityDropdown(false);
    setShowStyleDropdown(false);
    setShowModelDropdown(false);
  };

  const handleModelSelect = (option: Model) => {
    setSelectedModel(option);
    setShowModelDropdown(false);
    setShowStyleDropdown(false);
    setShowCommunityDropdown(false);
  };

  const handleStyleSelect = (name: string) => {
    setSelectedStyle(name);
    setShowStyleDropdown(false);
  };

  const handleImageClick = () => {
    toast("Image upload only works within a project right now!", {
      icon: "🖼️",
      duration: 2000,
    });
  };

  const handleSparkleClick = async () => {
    const text = promptInput.trim();
    if (!text) {
      toast("Type your goal first, then click the sparkles to enrich it.", {
        icon: "✨",
        duration: 3000,
      });
      return;
    }
    if (isEnriching || isCreatingFromPrompt) return;

    setIsEnriching(true);
    try {
      const enriched = await enrichPrompt(
        text,
        selectedTemplate,
        selectedModel?.id
      );
      setPromptInput(enriched);
      toast.success("Prompt enriched", { duration: 1500 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to enrich prompt";
      console.error("Failed to enrich prompt:", error);
      toast.error(message);
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <>
      <div className="text-center mb-10">
        <h1
          style={{ fontFamily: "Suisse" }}
          className="text-2xl font-semibold mb-6 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent"
        >
          {t("title")}
        </h1>
      </div>

      <div className="group/form-container content-center relative mx-auto w-full max-w-5xl mb-16">
        <div className="relative z-10 flex w-full flex-col">
          <div className="rounded-b-xl">
            <form className="focus-within:border-gray-500/60 bg-gray-900/30 border-gray-700/30 relative rounded-2xl border shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all duration-300 backdrop-blur-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
              <div className="relative z-10 grid min-h-0 rounded-2xl">
                <label className="sr-only" htmlFor="chat-main-textarea">
                  Chat Input
                </label>
                <textarea
                  id="chat-main-textarea"
                  name="content"
                  placeholder={t("placeholder")}
                  spellCheck="false"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  disabled={isCreatingFromPrompt}
                  className="resize-none overflow-auto w-full flex-1 bg-transparent p-4 text-sm outline-none ring-0 placeholder:text-gray-400 text-white disabled:opacity-50"
                  style={{
                    height: "240px",
                    minHeight: "240px",
                    maxHeight: "384px",
                  }}
                />
                <div className="flex items-center gap-3 px-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/20 hover:bg-gray-700/30 border border-gray-600/20 hover:border-gray-500/30 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-all duration-300 backdrop-blur-md bg-gradient-to-r from-white/[0.05] to-transparent cursor-pointer"
                        type="button"
                        onClick={() => {
                          setShowCommunityDropdown(!showCommunityDropdown);
                          setShowModelDropdown(false);
                          setShowStyleDropdown(false);
                        }}
                        aria-label="Choose template"
                        aria-haspopup="listbox"
                        aria-expanded={showCommunityDropdown}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        <span>{selectedTemplate}...</span>
                        <svg
                          height="12"
                          strokeLinejoin="round"
                          viewBox="0 0 16 16"
                          width="12"
                          className={`text-gray-400 transition-transform duration-200 ${
                            showCommunityDropdown ? "rotate-180" : ""
                          }`}
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12.0607 6.74999L11.5303 7.28032L8.7071 10.1035C8.31657 10.4941 7.68341 10.4941 7.29288 10.1035L4.46966 7.28032L3.93933 6.74999L4.99999 5.68933L5.53032 6.21966L7.99999 8.68933L10.4697 6.21966L11 5.68933L12.0607 6.74999Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>

                      {showCommunityDropdown && (
                        <div
                          role="listbox"
                          aria-label="Template"
                          className="absolute top-full left-0 mt-2 w-48 bg-gray-900/90 backdrop-blur-xl border border-gray-600/30 rounded-lg shadow-xl z-50 bg-gradient-to-br from-white/[0.08] to-white/[0.02]"
                        >
                          {communityOptions.map((option) => (
                            <button
                              key={option}
                              role="option"
                              aria-selected={selectedTemplate === option}
                              onClick={() => handleCommunitySelect(option)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-all duration-200 cursor-pointer"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/20 hover:bg-gray-700/30 border border-gray-600/20 hover:border-gray-500/30 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-all duration-300 backdrop-blur-md bg-gradient-to-r from-white/[0.05] to-transparent cursor-pointer"
                        type="button"
                        onClick={() => {
                          setShowStyleDropdown(!showStyleDropdown);
                          setShowCommunityDropdown(false);
                          setShowModelDropdown(false);
                        }}
                        aria-label={ts("chooseStyle")}
                        aria-haspopup="listbox"
                        aria-expanded={showStyleDropdown}
                      >
                        <Palette className="w-3.5 h-3.5 text-pink-400" />
                        <span>{ts(findStyleByName(selectedStyle)?.labelKey ?? "default")}</span>
                        <svg
                          height="12"
                          strokeLinejoin="round"
                          viewBox="0 0 16 16"
                          width="12"
                          className={`text-gray-400 transition-transform duration-200 ${
                            showStyleDropdown ? "rotate-180" : ""
                          }`}
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12.0607 6.74999L11.5303 7.28032L8.7071 10.1035C8.31657 10.4941 7.68341 10.4941 7.29288 10.1035L4.46966 7.28032L3.93933 6.74999L4.99999 5.68933L5.53032 6.21966L7.99999 8.68933L10.4697 6.21966L11 5.68933L12.0607 6.74999Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>

                      {showStyleDropdown && (
                        <div
                          role="listbox"
                          aria-label={ts("visualStyle")}
                          className="absolute top-full left-0 mt-2 w-52 max-h-[280px] overflow-y-auto bg-gray-900/90 backdrop-blur-xl border border-gray-600/30 rounded-lg shadow-xl z-50 bg-gradient-to-br from-white/[0.08] to-white/[0.02]"
                        >
                          {STYLES.map((style) => (
                            <button
                              key={style.name}
                              role="option"
                              aria-selected={selectedStyle === style.name}
                              onClick={() => handleStyleSelect(style.name)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-all duration-200 cursor-pointer"
                            >
                              {ts(style.labelKey)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/20 hover:bg-gray-700/30 border border-gray-600/20 hover:border-gray-500/30 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-all duration-300 backdrop-blur-md bg-gradient-to-r from-white/[0.05] to-transparent cursor-pointer"
                        type="button"
                        onClick={() => {
                          setShowModelDropdown(!showModelDropdown);
                          setShowCommunityDropdown(false);
                          setShowStyleDropdown(false);
                        }}
                        aria-label="Choose model"
                        aria-haspopup="listbox"
                        aria-expanded={showModelDropdown}
                      >
                        <span>{selectedModel?.name ?? "Loading..."}</span>
                        <svg
                          height="12"
                          strokeLinejoin="round"
                          viewBox="0 0 16 16"
                          width="12"
                          className={`text-gray-400 transition-transform duration-200 ${
                            showModelDropdown ? "rotate-180" : ""
                          }`}
                        >
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12.0607 6.74999L11.5303 7.28032L8.7071 10.1035C8.31657 10.4941 7.68341 10.4941 7.29288 10.1035L4.46966 7.28032L3.93933 6.74999L4.99999 5.68933L5.53032 6.21966L7.99999 8.68933L10.4697 6.21966L11 5.68933L12.0607 6.74999Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>

                      {showModelDropdown && (
                        <div
                          role="listbox"
                          aria-label="Model"
                          className="absolute top-full left-0 mt-2 w-40 bg-gray-900/90 backdrop-blur-xl border border-gray-600/30 rounded-lg shadow-xl z-50 bg-gradient-to-br from-white/[0.08] to-white/[0.02]"
                        >
                          {modelOptions.map((option) => (
                            <button
                              key={option.id}
                              role="option"
                              aria-selected={selectedModel?.id === option.id}
                              onClick={() => handleModelSelect(option)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-all duration-200 cursor-pointer"
                            >
                              {option.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-300 backdrop-blur-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      type="button"
                      onClick={handleSparkleClick}
                      disabled={isEnriching || isCreatingFromPrompt}
                      aria-label="Enrich prompt with AI"
                      title="Enrich your prompt with AI"
                    >
                      {isEnriching ? (
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm cursor-pointer"
                      type="button"
                      onClick={handleImageClick}
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handlePromptSubmit}
                      disabled={!promptInput.trim() || isCreatingFromPrompt}
                      className="flex items-center justify-center w-9 h-9 bg-white/90 text-black hover:bg-white disabled:bg-gray-600/50 disabled:text-gray-400 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl disabled:cursor-not-allowed cursor-pointer backdrop-blur-sm"
                      type="submit"
                    >
                      {isCreatingFromPrompt ? (
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg
                          height="16"
                          strokeLinejoin="round"
                          viewBox="0 0 16 16"
                          width="16"
                          fill="currentColor"
                        >
                          <path d="M8.70711 1.39644C8.31659 1.00592 7.68342 1.00592 7.2929 1.39644L2.21968 6.46966L1.68935 6.99999L2.75001 8.06065L3.28034 7.53032L7.25001 3.56065V14.25V15H8.75001V14.25V3.56065L12.7197 7.53032L13.25 8.06065L14.3107 6.99999L13.7803 6.46966L8.70711 1.39644Z" />
                        </svg>
                      )}
                      <span className="sr-only">Send Message</span>
                    </button>
                  </div>
                </div>

                {(showCommunityDropdown || showModelDropdown || showStyleDropdown) && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowCommunityDropdown(false);
                      setShowModelDropdown(false);
                      setShowStyleDropdown(false);
                    }}
                  />
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
