import type { Page } from "@playwright/test";

/** Browser API simulation tests language selection and failures, not audible voice quality. */
export async function installSpeech(page: Page, mode: "ready" | "missing" | "fail" = "ready") {
  await page.addInitScript((mode) => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        text: string;
        lang = "";
        voice: unknown;
        onerror?: (event: { error: string }) => void;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
    const events = new EventTarget();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () =>
          (mode === "missing" ? ["en-US"] : ["en-US", "vi-VN", "zh-CN"]).map((lang) => ({
            lang,
            name: lang,
            default: lang === "en-US",
          })),
        cancel: () => {},
        speak: (utterance: SpeechSynthesisUtterance) => {
          (window as unknown as { lastSpeech: { text: string; lang: string } }).lastSpeech = {
            text: utterance.text,
            lang: utterance.lang,
          };
          if (mode === "fail")
            window.setTimeout(
              () => utterance.onerror?.({ error: "audio-busy" } as SpeechSynthesisErrorEvent),
              0,
            );
        },
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
      },
    });
  }, mode);
}
export function lastSpeech(page: Page) {
  return page.evaluate(
    () => (window as unknown as { lastSpeech: { text: string; lang: string } }).lastSpeech,
  );
}
