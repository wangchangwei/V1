"use client";

import { NextIntlClientProvider } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

const STORAGE_KEY = "v1-locale";
const SUPPORTED = ["en", "zh"] as const;
export type Locale = (typeof SUPPORTED)[number];

const ALL_MESSAGES = { en, zh } as const;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  localeLabel: string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  localeLabel: "EN",
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function LocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && SUPPORTED.includes(stored)) {
      setLocaleState(stored);
    }
    setIsHydrated(true);
  }, []);

  // Set <html lang=""> whenever locale changes
  useEffect(() => {
    if (isHydrated) {
      document.documentElement.lang = locale;
    }
  }, [locale, isHydrated]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const localeLabel = locale === "en" ? "EN" : "中";

  return (
    <LocaleContext.Provider value={{ locale, setLocale, localeLabel }}>
      <NextIntlClientProvider
        locale={locale}
        messages={ALL_MESSAGES[locale]}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

