import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import vi from "../../messages/vi.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { answerMap, findSet, readSets, registerUser } from "./fixtures";
import { installSpeech, lastSpeech } from "./speech-fixture";

const messages = { vi, en, zh };
const pairs = [
  { title: "IELTS", term: "en", meaning: "vi", width: 320 },
  { title: "HSK", term: "zh", meaning: "vi", width: 390 },
  { title: "Du lịch", term: "vi", meaning: "en", width: 320 },
] as const;
const games = ["match", "memory", "scramble", "gravity", "quiz", "dictation"] as const;

async function changeLocale(page: Page, locale: string) {
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: locale, url: new URL(page.url()).origin }]);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("body")).not.toContainText(
    /MISSING_MESSAGE|INVALID_MESSAGE|Application error/,
  );
}
async function answerQuestion(shell: Locator, answers: Map<string, string>, m: typeof vi) {
  if (await shell.getByRole("list").count()) {
    const columns = shell.getByRole("list");
    for (const prompt of await columns.nth(0).getByRole("button").all()) {
      const text = ((await prompt.locator("span").last().textContent()) ?? "").trim();
      await prompt.click();
      const expected = answers.get(text)!;
      let matched = false;
      for (const candidate of await columns.nth(1).getByRole("button").all()) {
        if (((await candidate.locator("span").last().textContent()) ?? "").trim() === expected) {
          await candidate.click();
          matched = true;
          break;
        }
      }
      expect(matched).toBe(true);
    }
  } else {
    const text = ((await shell.locator('p[translate="no"]').first().textContent()) ?? "").trim();
    const answer = answers.get(text)!;
    if (await shell.getByRole("textbox").count())
      await shell.getByRole("textbox").fill(answer.normalize("NFD"));
    else if (
      (await shell.getByRole("radio").count()) > 2 ||
      (await shell.getByText(m.test.chooseAnswer, { exact: true }).count())
    ) {
      const labels = shell.locator("label");
      for (const label of await labels.all()) {
        if (((await label.locator('span[translate="no"]').textContent()) ?? "").trim() === answer) {
          await label.click();
          return;
        }
      }
      throw new Error(`No correct option for ${text}`);
    } else {
      const candidate = (
        (await shell.locator('p[translate="no"]').nth(1).textContent()) ?? ""
      ).trim();
      await shell
        .getByText(candidate === answer ? m.test.true : m.test.false, { exact: true })
        .click();
    }
  }
}

for (const locale of ["vi", "en", "zh"] as const) {
  const m = messages[locale];
  for (const pair of pairs) {
    for (const game of games) {
      test(`${locale} / ${pair.term}→${pair.meaning} / ${game}: complete, grade and replay on phone`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: pair.width, height: 844 });
        await installSpeech(page);
        await registerUser(page);
        const set = await findSet(page, pair.title);
        const answers = answerMap(set);
        await changeLocale(page, locale);
        if (game === "gravity") await page.clock.install();
        await page.goto(`/study/${set.id}/games/${game}`);
        await expect(
          page.getByRole("heading", { name: m.games[game].title, exact: true }),
        ).toBeVisible();
        await noOverflow(page);
        await page.getByRole("button", { name: m.games.start, exact: true }).click();
        if (game === "match" || game === "memory") {
          const buttons = page.locator("ul button:not([disabled])");
          await expect(buttons.first()).toBeVisible();
          const selector = game === "match" ? 'span[translate="no"]' : "span[lang]";
          const pairCount = (await buttons.count()) / 2;
          for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
            await expect(buttons).toHaveCount((pairCount - pairIndex) * 2);
            const first = buttons.first();
            const text = ((await first.locator(selector).textContent()) ?? "").trim();
            await page.waitForTimeout(350);
            await first.click();
            let found = false;
            for (const button of await buttons.all()) {
              if (
                ((await button.locator(selector).textContent()) ?? "").trim() === answers.get(text)
              ) {
                await button.click();
                found = true;
                break;
              }
            }
            expect(found).toBe(true);
          }
        } else if (game === "scramble") {
          const expectedRounds = Math.min(
            10,
            set.cards.filter(
              (card) => new Set(Array.from(card.term.normalize("NFC").replace(/\s/g, ""))).size > 1,
            ).length,
          );
          for (let i = 0; i < expectedRounds; i++) {
            const clue = (
              (await page.locator(`p[lang="${pair.meaning}"]`).first().textContent()) ?? ""
            ).trim();
            await page
              .getByLabel(m.games.scramble.typeWord, { exact: true })
              .fill(answers.get(clue)!.normalize("NFD"));
            await page.getByRole("button", { name: m.games.scramble.check, exact: true }).click();
            await expect(page.getByText(m.games.scramble.correct, { exact: true })).toBeVisible();
            await page.getByRole("button", { name: m.games.scramble.next, exact: true }).click();
          }
        } else if (game === "gravity") {
          const falling = page.locator("[style*=translateY]");
          await expect(falling).toBeVisible();
          const prompt = ((await falling.textContent()) ?? "").trim();
          await page
            .getByLabel(m.games.gravity.inputLabel, { exact: true })
            .fill(answers.get(prompt)!);
          await page.getByRole("button", { name: m.games.gravity.submit, exact: true }).click();
          await expect(page.getByText(m.games.score, { exact: true }).locator("..")).toContainText(
            "10",
          );
          await page.getByRole("button", { name: m.games.pause, exact: true }).click();
          const paused = await falling.textContent();
          await page.clock.runFor(5000);
          await expect(falling).toHaveText(paused!);
          await page.getByRole("button", { name: m.games.resume, exact: true }).first().click();
          for (let i = 0; i < 3; i++) await page.clock.runFor(13000);
        } else {
          for (let i = 0; i < Math.min(10, set.cards.length); i++) {
            if (game === "quiz") {
              const prompt = (
                (await page.locator('section > p[translate="no"]').textContent()) ?? ""
              ).trim();
              const expected = answers.get(prompt)!;
              await page.getByRole("button", { name: expected, exact: true }).click();
            } else {
              await page
                .getByRole("button", { name: m.games.practice.replay, exact: true })
                .click();
              const spoken = await lastSpeech(page);
              expect(spoken.lang).toBe({ vi: "vi-VN", en: "en-US", zh: "zh-CN" }[pair.term]);
              expect(set.cards.some((card) => card.term === spoken.text)).toBe(true);
              const input = page.getByLabel(m.games.practice.typeHeard, { exact: true });
              if (i === 0) {
                await input.fill("__incorrect__");
                await page
                  .getByRole("button", { name: m.games.practice.check, exact: true })
                  .click();
                await expect(
                  page.getByText(m.games.practice.incorrect, { exact: true }),
                ).toBeVisible();
              } else {
                await input.fill(spoken.text.normalize("NFD"));
                await page
                  .getByRole("button", { name: m.games.practice.check, exact: true })
                  .click();
              }
            }
            if (!(game === "dictation" && i === 0))
              await expect(page.getByText(m.games.practice.correct, { exact: true })).toBeVisible();
            await page.getByRole("button", { name: m.games.practice.next, exact: true }).click();
          }
        }
        await expect(
          page.getByRole("heading", {
            name: game === "gravity" ? m.games.gameOver : m.games.finished,
            exact: true,
          }),
        ).toBeVisible();
        await noOverflow(page);
        if (game === "dictation") {
          await page
            .getByRole("button", { name: m.games.practice.retryMistakes, exact: true })
            .click();
          await page.getByRole("button", { name: m.games.practice.replay, exact: true }).click();
          await page
            .getByLabel(m.games.practice.typeHeard, { exact: true })
            .fill((await lastSpeech(page)).text);
          await page.getByRole("button", { name: m.games.practice.check, exact: true }).click();
          await page.getByRole("button", { name: m.games.practice.next, exact: true }).click();
          await expect(page.getByText(m.games.practice.allCorrect, { exact: true })).toBeVisible();
        }
        await page.getByRole("button", { name: m.games.playAgain, exact: true }).click();
        await expect(
          page.getByRole("button", { name: m.games.playAgain, exact: true }),
        ).toHaveCount(0);
        await noOverflow(page);
        expect(await readSets(page)).toEqual(expect.arrayContaining([set]));
      });
    }
    test(`${locale} / ${pair.term}→${pair.meaning}: flashcards, learning and four test question types`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: pair.width, height: 844 });
      await installSpeech(page);
      await registerUser(page);
      const set = await findSet(page, pair.title);
      const answers = answerMap(set);
      await changeLocale(page, locale);
      await page.goto(`/study/${set.id}/flashcards`);
      await page
        .getByRole("button", { name: `${m.common.speak}: ${set.cards[0].term}`, exact: true })
        .click();
      expect((await lastSpeech(page)).lang).toBe(
        { vi: "vi-VN", en: "en-US", zh: "zh-CN" }[pair.term],
      );
      await page.getByRole("button", { name: m.flashcards.flip, exact: true }).click();
      await page
        .getByRole("button", { name: `${m.common.speak}: ${set.cards[0].definition}`, exact: true })
        .click();
      expect((await lastSpeech(page)).lang).toBe(
        { vi: "vi-VN", en: "en-US", zh: "zh-CN" }[pair.meaning],
      );
      for (let i = 0; i < set.cards.length; i++)
        await page.getByRole("button", { name: m.flashcards.known, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: m.flashcards.summaryTitle, exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      await page.goto(`/study/${set.id}/learn`);
      await page.getByRole("button", { name: m.learning.start, exact: true }).click();
      for (let i = 0; i < set.cards.length * 2 + 5; i++) {
        if (await page.getByRole("heading", { name: m.learning.complete, exact: true }).isVisible())
          break;
        const nextRound = page.getByRole("button", { name: m.learning.nextRound, exact: true });
        if (await nextRound.isVisible()) {
          await nextRound.click();
          continue;
        }
        await answerQuestion(page.locator('section[id^="question-"]'), answers, m);
        await page.getByRole("button", { name: m.learning.check, exact: true }).click();
        await expect(page.getByText(m.learning.correct, { exact: true })).toBeVisible();
        await page.getByRole("button", { name: m.learning.continue, exact: true }).click();
      }
      await expect(
        page.getByRole("heading", { name: m.learning.complete, exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      await page.goto(`/study/${set.id}/test`);
      await page.getByRole("button", { name: m.test.start, exact: true }).click();
      const questions = page.locator('section[id^="question-"]');
      await expect(questions.first()).toBeVisible();
      for (const question of await questions.all()) await answerQuestion(question, answers, m);
      await page.getByRole("button", { name: m.test.submit, exact: true }).click();
      await expect(page.getByRole("heading", { name: m.test.great, exact: true })).toBeVisible();
      await expect(page.getByText(m.test.noMistakes, { exact: true })).toBeVisible();
      await noOverflow(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await noOverflow(page);
      const axe = await new AxeBuilder({ page }).include("main").analyze();
      expect(axe.violations).toEqual([]);
    });
  }
  for (const mode of ["missing", "fail"] as const) {
    test(`${locale}: dictation handles ${mode} voice without accepting an inaudible answer`, async ({
      page,
    }) => {
      await installSpeech(page, mode);
      await page.setViewportSize({ width: 320, height: 740 });
      await registerUser(page);
      const set = await findSet(page, "HSK");
      await changeLocale(page, locale);
      await page.goto(`/study/${set.id}/games/dictation`);
      if (mode === "missing") {
        await expect(page.getByRole("button", { name: m.games.start, exact: true })).toBeDisabled();
        await expect(page.getByText(m.common.voiceMissing, { exact: true })).toBeVisible();
      } else {
        await page.getByRole("button", { name: m.games.start, exact: true }).click();
        await page.getByRole("button", { name: m.games.practice.replay, exact: true }).click();
        await expect(page.getByText(m.common.speechFailed, { exact: true })).toBeVisible();
        await page
          .getByLabel(m.games.practice.typeHeard, { exact: true })
          .fill((await lastSpeech(page)).text);
        await expect(
          page.getByRole("button", { name: m.games.practice.check, exact: true }),
        ).toBeDisabled();
      }
      await noOverflow(page);
    });
  }
}
