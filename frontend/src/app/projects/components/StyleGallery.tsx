"use client";

import { X } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import { STYLES } from "@/lib/styles";

const STYLE_IMAGES = [
  { file: "accessible-ethical.png", label: "Accessible & Ethical", name: "Accessible & Ethical" },
  { file: "aurora-ui.png", label: "Aurora UI", name: "Aurora UI" },
  { file: "brutalism.png", label: "Brutalism", name: "Brutalism" },
  { file: "claymorphism.png", label: "Claymorphism", name: "Neubrutalism" },
  { file: "dark-mode-oled.png", label: "Dark OLED", name: "Dark OLED" },
  { file: "flat-design.png", label: "Flat Design", name: "Flat Design" },
  { file: "glassmorphism.png", label: "Glassmorphism", name: "Glassmorphism" },
  { file: "hyperrealism.png", label: "Hyperrealism", name: "Hyperrealism" },
  { file: "inclusive-design.png", label: "Inclusive Design", name: "Inclusive Design" },
  { file: "liquid-glass.png", label: "Liquid Glass", name: "Liquid Glass" },
  { file: "micro-interactions.png", label: "Micro-interactions", name: "Micro-interactions" },
  { file: "minimalism.png", label: "Minimalism", name: "Minimalism" },
  { file: "motion-driven.png", label: "Motion Driven", name: "Motion Driven" },
  { file: "neumorphism.png", label: "Neumorphism", name: "Neumorphism" },
  { file: "retro-futurism.png", label: "Retro Futurism", name: "Retro Futurism" },
  { file: "skeuomorphism.png", label: "Skeuomorphism", name: "Skeuomorphism" },
  { file: "soft-ui-evolution.png", label: "Soft UI Evolution", name: "Soft UI Evolution" },
  { file: "vibrant-block.png", label: "Vibrant Block", name: "Vibrant Block" },
  { file: "zero-interface.png", label: "Zero Interface", name: "Zero Interface" },
];

interface StyleGalleryProps {
  activeStyle: string;
  onStyleChange: (styleName: string) => void;
}

export const StyleGallery = ({ activeStyle, onStyleChange }: StyleGalleryProps) => {
  const [lightboxImage, setLightboxImage] = useState<(typeof STYLE_IMAGES)[number] | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImage(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleApply = (item: (typeof STYLE_IMAGES)[number]) => {
    // Only apply if the style name exists in STYLES
    const exists = STYLES.some((s) => s.name === item.name);
    if (exists) {
      onStyleChange(item.name);
    }
    setLightboxImage(null);
  };

  return (
    <>
      <div className="mb-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">Style Gallery</h2>
            <p className="text-[#666666]">
              Browse visual styles and apply one to your project.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {STYLE_IMAGES.map((item) => {
            const isActive = activeStyle === item.name;
            const exists = STYLES.some((s) => s.name === item.name);
            return (
              <button
                key={item.file}
                onClick={() => setLightboxImage(item)}
                className={`group relative aspect-square rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${
                  isActive
                    ? "border-[#1a1a1a] ring-2 ring-[#1a1a1a]"
                    : "border-[#e5e5e5] hover:border-[#999999]"
                } ${!exists ? "opacity-40" : ""}`}
                title={item.label}
              >
                <Image
                  src={`/style/${item.file}`}
                  alt={item.label}
                  fill
                  className={`object-cover transition-transform duration-300 ${
                    isActive ? "" : "group-hover:scale-105"
                  }`}
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 20vw, (max-width: 1024px) 14vw, 10vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-1.5">
                  <p className="text-white text-[10px] font-medium leading-tight line-clamp-1 text-center">
                    {item.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

          {/* Close button */}
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 z-10 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ aspectRatio: "16/9" }}
          >
            <div className="relative flex-1">
              <Image
                src={`/style/${lightboxImage.file}`}
                alt={lightboxImage.label}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
              />
            </div>
            {/* Action bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#1a1a1a]">
              <p className="text-white font-medium">{lightboxImage.label}</p>
              {STYLES.some((s) => s.name === lightboxImage.name) ? (
                <button
                  onClick={() => handleApply(lightboxImage)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    activeStyle === lightboxImage.name
                      ? "bg-white/20 text-white/60 cursor-default"
                      : "bg-white text-black hover:bg-gray-200"
                  }`}
                >
                  {activeStyle === lightboxImage.name ? "Applied" : "Apply Style"}
                </button>
              ) : (
                <span className="text-white/40 text-xs">Not available</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
