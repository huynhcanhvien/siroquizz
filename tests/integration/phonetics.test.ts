import { expect, it } from "vitest";
import { phoneticReference, verifyPhonetic } from "@/server/ai/phonetics";

it.each([
  ["学习", "xuè xǐ", "xué xí"],
  ["学生", "xuě shéng", "xué shēng"],
  ["中国", "zhóng guǒ", "zhōng guó"],
  ["汉语", "hán yū", "hàn yǔ"],
  ["老师", "láo shí", "lǎo shī"],
  ["水", "shuì", "shuǐ"],
  ["绿茶", "lǘ chà", "lǜ chá"],
  ["女儿", "nǘ ěr", "nǚ ér"],
  ["谢谢", "xié xié", "xiè xie"],
  ["朋友", "pěng yòu", "péng you"],
  ["妈妈", "má má", "mā ma"],
  ["便宜", "piān yì", "pián yi"],
])("corrects impossible tones in %s", (term, wrong, expected) => {
  expect(verifyPhonetic(term, "zh", wrong)).toBe(expected);
});

it.each([
  ["你好", "nǐ hǎo"],
  ["一共", "yī gòng"],
  ["不是", "bù shì"],
  ["银行", "yín háng"],
  ["行走", "xíng zǒu"],
  ["重庆", "chóng qìng"],
  ["音乐", "yīn yuè"],
  ["快乐", "kuài lè"],
  ["学习", "xué xí"],
  ["谢谢", "xiè xie"],
  ["朋友", "péng you"],
  ["學習", "xué xí"],
])("supplies citation and lexical neutral tones for %s", (term, expected) => {
  expect(phoneticReference(term, "zh")?.citation).toBe(expected);
  expect(verifyPhonetic(term, "zh", "")).toBe(expected);
});

it("preserves context-dependent alternate readings rather than forcing a dictionary default", () => {
  expect(verifyPhonetic("长", "zh", "zhǎng")).toBe("zhǎng");
  expect(verifyPhonetic("长", "zh", "cháng")).toBe("cháng");
  expect(verifyPhonetic("好", "zh", "hào")).toBe("hào");
});

it("normalizes numbered tones, delimiters, case and decomposed Unicode", () => {
  expect(verifyPhonetic("你好", "zh", "[Ni3 Hao3]")).toBe("nǐ hǎo");
  expect(verifyPhonetic("学习", "zh", "xué xí".normalize("NFD"))).toBe("xué xí");
  expect(verifyPhonetic("你好！", "zh", "nǐ-hǎo")).toBe("nǐ hǎo");
});

it("repairs missing syllables and explanation text", () => {
  expect(verifyPhonetic("学习", "zh", "xué")).toBe("xué xí");
  expect(verifyPhonetic("学习", "zh", "The pinyin is xué xí")).toBe("xué xí");
});

it("leaves IPA, mixed scripts and unknown Han characters for contextual transcription", () => {
  for (const [term, language, ipa] of [
    ["cat", "en", "/kæt/"],
    ["mẹ", "vi", "/mɛ˧˨ʔ/"],
    ["AI技术", "zh", "AI jì shù"],
    ["𠮷", "zh", "jí"],
  ]) {
    expect(phoneticReference(term, language)).toBeUndefined();
    expect(verifyPhonetic(term, language, ipa)).toBe(ipa);
  }
});
