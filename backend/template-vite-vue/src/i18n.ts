import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type AppLocale = "en" | "zh";

const STORAGE_KEY = "vite-vue-template:locale";

// Pick the initial locale from localStorage, then from the browser, then
// fall back to Chinese since the original copy on this template is Chinese.
function detectInitialLocale(): AppLocale {
  if (typeof window === "undefined") return "zh";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // Storage may be disabled (Safari private mode, sandboxed iframe) — fall through.
  }
  const browser = window.navigator?.language?.toLowerCase() ?? "";
  if (browser.startsWith("zh")) return "zh";
  if (browser.startsWith("en")) return "en";
  return "zh";
}

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: "en",
  messages: { en, zh },
});

export function persistLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore — best-effort persistence.
  }
}
