"use client";

import { ChevronDown, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ModelInfo } from "@/lib/backend/api";

interface ModelSelectProps {
  models: ModelInfo[];
  value: string;
  disabled?: boolean;
  onChange: (model: string) => void;
}

// Compact model selector rendered in the chat sidebar header. A native
// <select> styled to match the surrounding dark glass UI keeps the dep
// surface small and behaves predictably across browsers (keyboard nav,
// screen reader support). A custom popover would be nicer but is not
// worth the extra code yet.
export const ModelSelect = ({
  models,
  value,
  disabled = false,
  onChange,
}: ModelSelectProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = models.find((m) => m.id === value);
  const label = current?.displayName ?? value;

  if (models.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800/40 hover:bg-gray-700/50 disabled:bg-gray-800/20 disabled:cursor-not-allowed text-white/90 hover:text-white disabled:text-white/40 rounded-md text-xs font-medium transition-all border border-gray-700/40 hover:border-gray-600/50 backdrop-blur-md shadow-sm"
        title={current ? `${current.displayName} — ${current.description}` : value}
        data-testid="model-select-trigger"
      >
        <Cpu className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[240px] bg-gray-900/95 backdrop-blur-xl border border-gray-700/60 rounded-lg shadow-2xl shadow-black/40 py-1 overflow-hidden">
          {models.map((m) => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (m.id !== value) onChange(m.id);
                }}
                className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                  selected
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
                data-testid={`model-option-${m.id}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium">{m.displayName}</span>
                  {selected && (
                    <span className="ml-auto text-[10px] text-blue-300 font-semibold uppercase tracking-wider">
                      Selected
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/50 leading-relaxed">
                  {m.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
