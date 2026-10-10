import { afterEach, describe, expect, it, vi } from "vitest";
import { cn } from "./cn";
import { isLangCode, SPEECH_LANG } from "./languages";
import { RepositoryError, toErrorCode } from "./repository-error";
import { isSpeechSupported, speak } from "./speech";
import { StorageError } from "./storage";

describe("toErrorCode", () => {
  it("maps repository, storage and unknown errors", () => {
    expect(toErrorCode(new RepositoryError("NOT_FOUND"))).toBe("NOT_FOUND");
    expect(toErrorCode(new StorageError("full"))).toBe("STORAGE");
    expect(toErrorCode(new Error("boom"))).toBe("UNKNOWN");
    expect(toErrorCode("weird")).toBe("UNKNOWN");
  });
});

describe("languages", () => {
  it("recognises supported content languages", () => {
    expect(isLangCode("zh")).toBe(true);
    expect(isLangCode("xx")).toBe(false);
    expect(SPEECH_LANG.vi).toBe("vi-VN");
  });
});

describe("cn", () => {
  it("merges conflicting tailwind classes", () => {
    expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4");
  });
});

describe("speech", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "speechSynthesis");
  });

  it("is unsupported without speechSynthesis and does nothing", () => {
    expect(isSpeechSupported()).toBe(false);
    expect(() => speak("hello", "en")).not.toThrow();
  });

  it("speaks with the language's voice tag", () => {
    const synth = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [{ lang: "zh-CN", name: "Mandarin", default: false }],
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        constructor(public text: string) {}
      },
    );
    speak("你好", "zh");
    expect(synth.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: "你好", lang: "zh-CN" }),
    );
    speak("   ", "zh");
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});
