import { SPEECH_LANG } from "./languages";
import type { LangCode } from "./types";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang: LangCode): void {
  if (!isSpeechSupported() || text.trim().length === 0) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG[lang];
  utterance.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
