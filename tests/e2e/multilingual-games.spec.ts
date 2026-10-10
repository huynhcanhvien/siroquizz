import { expect, test } from "@playwright/test";
import vi from "../../messages/vi.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { answerMap, findSet, readSets, registerUser } from "./fixtures";
const messages = { vi, en, zh };
const labels = { vi: "Tiếng Việt", en: "English", zh: "中文" };

for (const locale of ["vi", "en", "zh"] as const) {
  test(`${locale}: mobile study preserves content and choices across interface language changes`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 320, height: 740 });
    await registerUser(page);
    const before = await readSets(page);
    await page.context().addCookies([
      {
        name: "NEXT_LOCALE",
        value: locale,
        url: "http://localhost:" + (process.env.E2E_PORT ?? "3100"),
      },
    ]);
    for (const set of before) {
      await page.goto(`/study/${set.id}/learn`);
      const m = messages[locale];
      await page.getByRole("button", { name: m.learning.start, exact: true }).click();
      const prompt = page.locator('section[id^="question-"] p[translate="no"]').first();
      await expect(prompt).toBeVisible();
      const term = await prompt.textContent();
      expect(set.cards.some((card) => card.term === term)).toBe(true);
      const choices = await page.locator('fieldset span[translate="no"]').allTextContents();
      const nextLocale = locale === "en" ? "zh" : "en";
      await page.getByRole("button", { name: `${m.language.label}: ${labels[locale]}` }).click();
      await page.getByRole("menuitemradio", { name: labels[nextLocale], exact: true }).click();
      await expect(
        page.getByRole("button", { name: messages[nextLocale].learning.check, exact: true }),
      ).toBeVisible();
      await expect(prompt).toHaveText(term!);
      expect(await page.locator('fieldset span[translate="no"]').allTextContents()).toEqual(
        choices,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      // Reset only the interface cookie for the next set; content remains identical.
      await page
        .context()
        .addCookies([{ name: "NEXT_LOCALE", value: locale, url: new URL(page.url()).origin }]);
    }
    expect(await readSets(page)).toEqual(before);
  });
}

test("English phone quiz completes, retries mistakes and keeps the selected content languages", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await registerUser(page);
  const set = await findSet(page, "HSK");
  const answers = answerMap(set);
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL(page.url()).origin }]);
  await page.goto(`/study/${set.id}/games/quiz`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  let missedTerm = "";
  for (let i = 0; i < 10; i++) {
    const prompt = ((await page.locator('section > p[translate="no"]').textContent()) ?? "").trim();
    const correct = answers.get(prompt)!;
    if (i === 0) {
      missedTerm = prompt;
      const options = page.locator("fieldset button");
      for (const button of await options.all()) {
        if ((await button.textContent())?.trim() !== correct) {
          await button.click();
          break;
        }
      }
    } else await page.getByRole("button", { name: correct, exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Done!" })).toBeVisible();
  await page.getByRole("button", { name: "Practice mistakes", exact: true }).click();
  await expect(page.getByText("Question 1/1", { exact: true })).toBeVisible();
  await expect(page.locator('section > p[translate="no"]').first()).toHaveText(missedTerm);
  await page.getByRole("button", { name: answers.get(missedTerm)!, exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("You answered everything correctly!")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("listen and spell uses a voice for the selected side and supports accented input", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        text: string;
        lang = "";
        voice: unknown;
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
          ["en-US", "vi-VN", "zh-CN"].map((lang) => ({
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
        },
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await registerUser(page);
  const set = await findSet(page, "HSK");
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL(page.url()).origin }]);
  await page.goto(`/study/${set.id}/games/dictation`);
  await page.getByLabel("Study direction", { exact: true }).selectOption("definition");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await page.getByRole("button", { name: "Listen again", exact: true }).click();
    const spoken = await page.evaluate(
      () => (window as unknown as { lastSpeech: { text: string; lang: string } }).lastSpeech,
    );
    expect(spoken.lang).toBe("vi-VN");
    expect(set.cards.some((card) => card.definition === spoken.text)).toBe(true);
    await page
      .getByLabel("Type what you heard", { exact: true })
      .fill(spoken.text.normalize("NFD"));
    await page.getByRole("button", { name: "Check answer", exact: true }).click();
    await expect(page.getByText("Correct!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Done!" })).toBeVisible();
  await expect(page.getByText("You answered everything correctly!")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("English phone can complete Match, Memory and Scramble with Chinese–Vietnamese content", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 740 });
  await registerUser(page);
  const set = await findSet(page, "HSK");
  const answers = answerMap(set);
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL(page.url()).origin }]);
  for (const game of ["match", "memory"] as const) {
    await page.goto(`/study/${set.id}/games/${game}`);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const buttons = page.locator("ul button:not([disabled])");
    await expect(buttons.first()).toBeVisible();
    while ((await buttons.count()) > 0) {
      const first = buttons.first();
      const text = (
        (await first
          .locator(game === "match" ? 'span[translate="no"]' : "span[lang]")
          .textContent()) ?? ""
      ).trim();
      await page.waitForTimeout(350);
      await first.click();
      for (const button of await buttons.all()) {
        const candidate = (
          (await button
            .locator(game === "match" ? 'span[translate="no"]' : "span[lang]")
            .textContent()) ?? ""
        ).trim();
        if (candidate === answers.get(text)) {
          await button.click();
          break;
        }
      }
    }
    await expect(page.getByRole("heading", { name: "Done!" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto(`/study/${set.id}/games/scramble`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const roundCount = Math.min(
    10,
    set.cards.filter((card) => new Set(Array.from(card.term.normalize("NFC"))).size > 1).length,
  );
  for (let i = 0; i < roundCount; i++) {
    const meaning = ((await page.locator('p[lang="vi"]').first().textContent()) ?? "").trim();
    await page
      .getByLabel("Or type the whole word / phrase", { exact: true })
      .fill(answers.get(meaning)!);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByText("Correct!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next word", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Done!" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
