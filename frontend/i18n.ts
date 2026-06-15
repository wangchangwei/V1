import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? "en";
  return {
    locale,
    messages: {
      en: (await import("./messages/en.json")).default,
      zh: (await import("./messages/zh.json")).default,
    },
  };
});
