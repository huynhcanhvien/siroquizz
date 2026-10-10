import { CONTENT_LANGUAGES, type LangCode } from "./types";

/** BCP 47 tags used for speech synthesis voices. */
export const SPEECH_LANG: Record<LangCode, string> = {
  vi: "vi-VN",
  en: "en-US",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  fr: "fr-FR",
  de: "de-DE",
};

export const CONTENT_LANGUAGE_OPTIONS: readonly LangCode[] = CONTENT_LANGUAGES;

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === "string" && (CONTENT_LANGUAGES as readonly string[]).includes(value);
}

/** Names follow UI locale; content language codes remain unchanged. */
export function languageName(t: (key: LangCode) => string, lang: LangCode): string {
  return t(lang);
}
