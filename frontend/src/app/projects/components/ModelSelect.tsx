"use client";

import { ChevronDown, Cpu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ModelInfo } from "@/lib/backend/api";

interface ModelSelectProps {
  models: ModelInfo[];
  value: string;
  disabled?: boolean;
  onChange: (model: string) => void;
}

// Compact model selector rendered in the chat sidebar footer. The trigger
// stays a small pill; selection happens in a centered modal dialog so the
// list is never clipped by the chat panel's overflow container (the previous
// bottom-anchored popover collided with the textarea and could be hidden by
// ancestor overflow/scroll contexts). The dialog is portaled to
// document.body to escape every ancestor stacking / overflow / transform
// context — the chat sidebar has `overflow-hidden` plus several
// `relative z-10` wrappers that would otherwise let sibling panels paint
// over a nested `position: fixed` overlay. Escape, backdrop click, and the
// X button all close the modal; selecting a model also closes it.
export const ModelSelect = ({
  models,
  value,
  disabled = false,
  onChange,
}: ModelSelectProps) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // Portal target must only exist on the client; `document` is undefined
  // during Next.js SSR for this client component.
  useEffect(() => {
    setMounted(true);
  }, []);

  const current = models.find((m) => m.id === value);
  const label = current?.displayName ?? value;

  // Trap Escape to close and remember the trigger so focus can be restored
  // when the modal tears down (basic dialog affordance; the chat input's
  // textarea is right above this control, so a stray Escape here would
  // otherwise feel like the chat stopped working).
  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      lastFocusRef.current?.focus?.();
    };
  }, [open]);

  if (models.length === 0) {
    return null;
  }

  const dialog = open && !disabled && (
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        // Backdrop click closes; clicks inside the panel must not bubble
        // up and dismiss the dialog.
        if (e.target === e.currentTarget) setOpen(false);
      }}
      data-testid="model-select-dialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md bg-gray-900/95 backdrop-blur-xl border border-gray-700/60 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/60">
          <div>
            <h2
              id={titleId}
              className="text-sm font-semibold text-white"
            >
              Select model
            </h2>
            <p className="text-[11px] text-white/50 mt-0.5">
              Used for the next messages in this project
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close model selector"
            data-testid="model-select-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul
          role="listbox"
          aria-label="Available models"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {models.map((m) => {
            const selected = m.id === value;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setOpen(false);
                    if (m.id !== value) onChange(m.id);
                  }}
                  className={`w-full flex flex-col items-start gap-1 px-4 py-2.5 text-left transition-colors ${
                    selected
                      ? "bg-white/10 text-white"
                      : "text-white/85 hover:bg-white/5 hover:text-white"
                  }`}
                  data-testid={`model-option-${m.id}`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-sm font-medium">
                      {m.displayName}
                    </span>
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">
                      {m.provider}
                    </span>
                    {selected && (
                      <span className="ml-auto text-[10px] text-blue-300 font-semibold uppercase tracking-wider">
                        Selected
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-white/55 leading-relaxed">
                    {m.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800/40 hover:bg-gray-700/50 disabled:bg-gray-800/20 disabled:cursor-not-allowed text-white/90 hover:text-white disabled:text-white/40 rounded-md text-xs font-medium transition-all border border-gray-700/40 hover:border-gray-600/50 backdrop-blur-md shadow-sm"
        title={current ? `${current.displayName} — ${current.description}` : value}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={titleId}
        data-testid="model-select-trigger"
      >
        <Cpu className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>

      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
};

