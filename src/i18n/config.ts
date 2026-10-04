export const LOCALES = ["vi", "zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "NEXT_LOCALE";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Native names are shown regardless of the active UI language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  vi: "Tiếng Việt",
  zh: "中文",
  en: "English",
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  vi: "vi",
  zh: "zh-Hans",
  en: "en",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function persistLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
