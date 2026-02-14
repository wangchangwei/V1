"use client";

import { Paperclip, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { createContainer } from "../../../lib/backend/api";

interface ProjectPromptInterfaceProps {
  selectedTemplate: string;
  onTemplateChange: (template: string) => void;
}

export const ProjectPromptInterface = ({
  selectedTemplate,
  onTemplateChange,
}: ProjectPromptInterfaceProps) => {
  const [promptInput, setPromptInput] = useState("");
  const [isCreatingFromPrompt, setIsCreatingFromPrompt] = useState(false);
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedModel, setSelectedModel] = useState("Claude Sonnet 4");
  const router = useRouter();

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
        )}`
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

  const modelOptions = ["Claude Sonnet 4"];

  const handleCommunitySelect = (option: string) => {
    onTemplateChange(option);
    setShowCommunityDropdown(false);
  };

  const handleModelSelect = (option: string) => {
    setSelectedModel(option);
    setShowModelDropdown(false);
  };

  const handleImageClick = () => {
    toast("Image upload only works within a project right now!", {
      icon: "🖼️",
      duration: 2000,
    });
  };

  const handleSparkleClick = () => {
    toast("AI suggestions are coming soon!", {
      icon: "✨",
      duration: 2000,
    });
  };

  return (
    <>
      <div className="text-center mb-10">
        <h1
          style={{ fontFamily: "Suisse" }}
          className="text-2xl font-semibold mb-6 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent"
        >
          What do you want to build?
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
                  placeholder="Ask December to build..."
                  spellCheck="false"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  disabled={isCreatingFromPrompt}
                  className="resize-none overflow-auto w-full flex-1 bg-transparent p-4 text-sm outline-none ring-0 placeholder:text-gray-400 text-white disabled:opacity-50"
                  style={{
                    height: "54px",
                    minHeight: "54px",
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
                        }}
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
                        <div className="absolute top-full left-0 mt-2 w-48 bg-gray-900/90 backdrop-blur-xl border border-gray-600/30 rounded-lg shadow-xl z-50 bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                          {communityOptions.map((option) => (
                            <button
                              key={option}
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
                          setShowModelDropdown(!showModelDropdown);
                          setShowCommunityDropdown(false);
                        }}
                      >
                        <span>{selectedModel}</span>
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
                        <div className="absolute top-full left-0 mt-2 w-40 bg-gray-900/90 backdrop-blur-xl border border-gray-600/30 rounded-lg shadow-xl z-50 bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                          {modelOptions.map((option) => (
                            <button
                              key={option}
                              onClick={() => handleModelSelect(option)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-all duration-200 cursor-pointer"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-sm cursor-pointer"
                      type="button"
                      onClick={handleSparkleClick}
                    >
                      <Sparkles className="w-4 h-4" />
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

                {(showCommunityDropdown || showModelDropdown) && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowCommunityDropdown(false);
                      setShowModelDropdown(false);
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
