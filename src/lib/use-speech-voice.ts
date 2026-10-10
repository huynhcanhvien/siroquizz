"use client";

import { useCallback, useSyncExternalStore } from "react";
import { hasVoice, isSpeechSupported } from "./speech";
import type { LangCode } from "./types";

type VoiceStatus = "loading" | "ready" | "missing";
const settled = new WeakSet<SpeechSynthesis>();
function subscribe(listener: () => void): () => void {
  if (!isSpeechSupported()) return () => {};
  const synthesis = window.speechSynthesis;
  synthesis.addEventListener("voiceschanged", listener);
  const timer = window.setTimeout(() => {
    settled.add(synthesis);
    listener();
  }, 2500);
  return () => {
    window.clearTimeout(timer);
    synthesis.removeEventListener("voiceschanged", listener);
  };
}
const serverSnapshot = (): VoiceStatus => "loading";
export function useSpeechVoice(lang: LangCode): VoiceStatus {
  const snapshot = useCallback((): VoiceStatus => {
    if (!isSpeechSupported()) return "missing";
    if (hasVoice(lang)) return "ready";
    const synthesis = window.speechSynthesis;
    return settled.has(synthesis) || synthesis.getVoices().length > 0 ? "missing" : "loading";
  }, [lang]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
