"use client";

import { Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type MouseEvent } from "react";
import { useClientValue } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import { isSpeechSupported, speak } from "@/lib/speech";
import { useSpeechVoice } from "@/lib/use-speech-voice";
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
  const status = useSpeechVoice(lang);
  const [failed, setFailed] = useState(false);
  if (!supported) return null;

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    setFailed(!speak(text, lang, () => setFailed(true)));
  };

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        title={
          status === "loading"
            ? t("loading")
            : status === "missing"
              ? t("voiceMissing")
              : t("speak")
        }
        aria-label={`${t("speak")}: ${text}`}
        className={cn(
          "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-primary-text",
          className,
        )}
      >
        <Volume2 className="size-4.5" aria-hidden />
      </button>
      {failed ? (
        <span role="status" className="max-w-40 text-xs text-danger">
          {status === "missing" ? t("voiceMissing") : t("speechFailed")}
        </span>
      ) : null}
    </span>
  );
}
