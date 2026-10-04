"use client";

import { Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { useClientValue } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import { isSpeechSupported, speak } from "@/lib/speech";
import type { LangCode } from "@/lib/types";

interface SpeakButtonProps {
  text: string;
  lang: LangCode;
  className?: string;
}

/** Hidden when the browser has no speech synthesis. */
export function SpeakButton({ text, lang, className }: SpeakButtonProps) {
  const t = useTranslations("common");
  const supported = useClientValue(isSpeechSupported, false);
  if (!supported) return null;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    speak(text, lang);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${t("speak")}: ${text}`}
      className={cn(
        "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-primary-text",
        className,
      )}
    >
      <Volume2 className="size-4.5" aria-hidden />
    </button>
  );
}
