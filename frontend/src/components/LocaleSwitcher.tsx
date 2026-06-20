"use client";

import { Globe } from "lucide-react";
import { useLocale } from "@/providers/LocaleProvider";
import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";

const LOCALES = [
  { code: "en" as const, label: "English" },
  { code: "zh" as const, label: "中文" },
];

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useTranslations("lang");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLabel = locale === "en" ? "EN" : "中";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-400 hover:text-[#1a1a1a] hover:bg-[#f1f0ef] rounded-md transition-all duration-200 text-xs font-medium cursor-pointer"
        aria-label={t("switchAria")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{currentLabel}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="语言"
          className="absolute right-0 top-full mt-1.5 w-36 bg-gray-800/95 backdrop-blur-xl border border-gray-600/40 rounded-lg shadow-xl z-50 py-1"
        >
          {LOCALES.map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={locale === l.code}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-between transition-all duration-150 first:rounded-t-lg last:rounded-b-lg cursor-pointer"
            >
              <span>{l.label}</span>
              {locale === l.code && (
                <span className="text-purple-400 text-xs font-bold">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
