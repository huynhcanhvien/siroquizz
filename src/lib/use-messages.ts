"use client";

import { useTranslations } from "next-intl";
import { toErrorCode } from "./repository-error";

type ValidationKey = Parameters<ReturnType<typeof useTranslations<"validation">>>[0];

/** Translates zod issue messages (which are i18n keys) and falls back to the raw text. */
export function useValidationMessage(): (key?: string) => string | undefined {
  const t = useTranslations("validation");
  return (key) => {
    if (!key) return undefined;
    return t.has(key as ValidationKey) ? t(key as ValidationKey) : key;
  };
}

/** Maps repository errors to a translated, user-friendly message. */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations("errors");
  return (error) => t(toErrorCode(error));
}
