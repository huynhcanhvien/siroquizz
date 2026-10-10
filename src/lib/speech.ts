import { SPEECH_LANG } from "./languages";
import type { LangCode } from "./types";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Exact regional voice first; Mandarin must never fall back to Cantonese. */
export function selectVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: LangCode,
): SpeechSynthesisVoice | undefined {
  const tag = SPEECH_LANG[lang].toLowerCase();
  const candidates = voices.filter((voice) => {
    const voiceLang = voice.lang.replaceAll("_", "-").toLowerCase();
    return lang === "zh"
      ? ["zh-cn", "zh-sg", "zh-tw", "zh", "cmn", "cmn-cn", "cmn-tw"].includes(voiceLang)
      : voiceLang.split("-")[0] === lang;
  });
  return (
    candidates.find((voice) => voice.lang.replaceAll("_", "-").toLowerCase() === tag) ??
    candidates.find((voice) => voice.default) ??
    candidates[0]
  );
}

export function hasVoice(lang: LangCode): boolean {
  return isSpeechSupported() && Boolean(selectVoice(window.speechSynthesis.getVoices(), lang));
}

let activeUtterance: SpeechSynthesisUtterance | undefined;
export function stopSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
  activeUtterance = undefined;
}

/** Returns false rather than silently pronouncing a language using an unrelated voice. */
export function speak(text: string, lang: LangCode, onError?: () => void): boolean {
  if (!isSpeechSupported() || text.trim().length === 0) return false;
  const voice = selectVoice(window.speechSynthesis.getVoices(), lang);
  if (!voice) return false;
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text.normalize("NFC"));
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.92;
  utterance.onerror = (event) => {
    if (event.error !== "interrupted" && event.error !== "canceled") onError?.();
    if (activeUtterance === utterance) activeUtterance = undefined;
  };
  utterance.onend = () => {
    if (activeUtterance === utterance) activeUtterance = undefined;
  };
  activeUtterance = utterance; // Retain the utterance while native speech is running.
  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    activeUtterance = undefined;
    onError?.();
    return false;
  }
}
