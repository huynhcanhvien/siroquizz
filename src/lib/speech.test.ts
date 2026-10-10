import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { selectVoice, speak } from "./speech";
import { useSpeechVoice } from "./use-speech-voice";

const voice = (lang: string, isDefault = false) =>
  ({ lang, name: lang, default: isDefault }) as SpeechSynthesisVoice;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
});
function install(voices: SpeechSynthesisVoice[]) {
  const events = new EventTarget();
  const synth = {
    getVoices: vi.fn(() => voices),
    cancel: vi.fn(),
    speak: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  return { synth, events };
}
describe("content-language speech", () => {
  it("prefers the exact language tag over an unrelated default", () => {
    const viVoice = voice("vi-VN");
    expect(selectVoice([voice("en-US", true), viVoice], "vi")).toBe(viVoice);
    expect(selectVoice([voice("en-GB")], "en")?.lang).toBe("en-GB");
  });
  it("does not substitute Cantonese or English for Mandarin", () => {
    expect(selectVoice([voice("zh-HK"), voice("en-US")], "zh")).toBeUndefined();
    expect(selectVoice([voice("zh-TW")], "zh")?.lang).toBe("zh-TW");
  });
  it("does not speak using the wrong language when a voice is missing", () => {
    const { synth } = install([voice("en-US")]);
    expect(speak("xin chào", "vi")).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it("waits for voiceschanged, handles language changes and removes subscriptions", () => {
    const { synth, events } = install([]);
    const remove = vi.spyOn(synth, "removeEventListener");
    const hook = renderHook(({ lang }) => useSpeechVoice(lang), {
      initialProps: { lang: "vi" as "vi" | "zh" },
    });
    expect(hook.result.current).toBe("loading");
    act(() => {
      synth.getVoices.mockReturnValue([voice("vi-VN")]);
      events.dispatchEvent(new Event("voiceschanged"));
    });
    expect(hook.result.current).toBe("ready");
    hook.rerender({ lang: "zh" });
    expect(hook.result.current).toBe("missing");
    hook.unmount();
    expect(remove).toHaveBeenCalled();
  });
  it("stops waiting when the browser never loads voices", () => {
    vi.useFakeTimers();
    install([]);
    const hook = renderHook(() => useSpeechVoice("vi"));
    act(() => vi.advanceTimersByTime(2500));
    expect(hook.result.current).toBe("missing");
    hook.unmount();
  });
  it("reports playback failure", () => {
    const { synth } = install([voice("vi-VN")]);
    const onError = vi.fn();
    expect(speak("chào".normalize("NFD"), "vi", onError)).toBe(true);
    const utterance = synth.speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe("chào");
    utterance.onerror?.({ error: "audio-busy" } as SpeechSynthesisErrorEvent);
    expect(onError).toHaveBeenCalledOnce();
  });
});
