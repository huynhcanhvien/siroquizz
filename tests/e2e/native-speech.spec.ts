import { expect, test } from "@playwright/test";
import vi from "../../messages/vi.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { findSet, registerUser } from "./fixtures";
const messages = { vi, en, zh };
for (const locale of ["vi", "en", "zh"] as const) {
  test(`${locale}: actual device voices pronounce term and meaning independently of UI locale`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      if (!("speechSynthesis" in window)) return;
      const nativeSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance) => {
        const result = {
          text: utterance.text,
          lang: utterance.lang,
          voiceLang: utterance.voice?.lang,
          status: "speaking",
        };
        (window as unknown as { nativeSpeech: typeof result }).nativeSpeech = result;
        utterance.addEventListener("end", () => {
          result.status = "ended";
        });
        utterance.addEventListener("error", (event) => {
          result.status = event.error;
        });
        nativeSpeak(utterance);
      };
    });
    await registerUser(page);
    const voiceTags = await page.evaluate(
      () => window.speechSynthesis?.getVoices().map((voice) => voice.lang) ?? [],
    );
    test.skip(
      !["en-US", "vi-VN", "zh-CN"].every((tag) => voiceTags.includes(tag)),
      "This device does not have all three native voices installed",
    );
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: locale, url: new URL(page.url()).origin }]);
    for (const [title, termLang, meaningLang] of [
      ["IELTS", "en-US", "vi-VN"],
      ["HSK", "zh-CN", "vi-VN"],
      ["Du lịch", "vi-VN", "en-US"],
    ]) {
      const set = await findSet(page, title);
      await page.goto(`/study/${set.id}/flashcards`);
      for (const [text, lang] of [
        [set.cards[0].term, termLang],
        [set.cards[0].definition, meaningLang],
      ]) {
        if (text === set.cards[0].definition)
          await page
            .getByRole("button", { name: messages[locale].flashcards.flip, exact: true })
            .click();
        await page
          .getByRole("button", { name: `${messages[locale].common.speak}: ${text}`, exact: true })
          .click();
        await expect
          .poll(
            () =>
              page.evaluate(
                () =>
                  (window as unknown as { nativeSpeech: { status: string } }).nativeSpeech?.status,
              ),
            { timeout: 15000 },
          )
          .toBe("ended");
        const actual = await page.evaluate(
          () =>
            (
              window as unknown as {
                nativeSpeech: { text: string; lang: string; voiceLang: string };
              }
            ).nativeSpeech,
        );
        expect(actual).toMatchObject({ text, lang, voiceLang: lang });
      }
    }
  });
}
