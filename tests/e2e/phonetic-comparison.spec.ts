import { expect, test } from "@playwright/test";
import vi from "../../messages/vi.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { registerUser } from "./fixtures";

const messages = { vi, en, zh };
for (const locale of ["vi", "en", "zh"] as const) {
  test(`${locale}: compare AI phonetics and save only selected readings on mobile`, async ({
    page,
  }) => {
    test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Requires persisted sets");
    await page.setViewportSize({ width: 320, height: 740 });
    await registerUser(page);
    const origin = new URL(page.url()).origin;
    const created = await page.request.post("/api/v1/sets", {
      headers: { Origin: origin },
      data: {
        title: "Phonetic comparison",
        description: "",
        termLang: "zh",
        definitionLang: "vi",
        source: "manual",
        cards: [
          { term: "学习", definition: "học tập", phonetic: "xuè xǐ" },
          { term: "朋友", definition: "bạn bè" },
        ],
      },
    });
    expect(created.ok()).toBeTruthy();
    const set = (await created.json()).data;
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: origin }]);
    await page.route("**/api/v1/ai/phonetics", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ setId: set.id, scope: "all" });
      await route.fulfill({
        json: {
          success: true,
          data: {
            cards: [
              { id: set.cards[0].id, text: "xué xí" },
              { id: set.cards[1].id, text: "péng you" },
            ],
          },
        },
      });
    });
    await page.goto(`/sets/${set.id}`);
    const t = messages[locale].ai;
    await page.getByRole("button", { name: t.fillPhonetics }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("xuè xǐ", { exact: true })).toBeVisible();
    const choices = dialog.getByRole("checkbox");
    await expect(choices.nth(0)).not.toBeChecked();
    await expect(choices.nth(1)).toBeChecked();
    // Keep the old reading, deliberately decline the new card, then choose only the old card.
    await choices.nth(1).uncheck();
    await expect(dialog.getByRole("button", { name: t.applyPhonetics })).toBeDisabled();
    await choices.nth(0).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: t.applyPhonetics }).click();
    await expect(dialog).not.toBeVisible();
    const saved = (await (await page.request.get(`/api/v1/sets/${set.id}`)).json()).data;
    expect(saved.cards[0].phonetic).toBe("xué xí");
    expect(saved.cards[1].phonetic).toBeUndefined();
    await page.reload();
    await expect(page.getByText("xué xí", { exact: true }).first()).toBeVisible();
    const example = "我学习中文。 Tôi học tiếng Trung.";
    await page.route("**/api/v1/ai/examples", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ setId: set.id });
      await route.fulfill({
        json: {
          success: true,
          data: {
            cards: set.cards.map((card: { id: string }) => ({ id: card.id, text: example })),
          },
        },
      });
    });
    await page.getByRole("button", { name: t.createExamples }).click();
    const exampleInput = dialog.getByRole("textbox", { name: `${t.exampleSentence}: 学习` });
    await expect(exampleInput).toHaveValue(example);
    // Generating a preview does not save anything until the user confirms.
    const preview = (await (await page.request.get(`/api/v1/sets/${set.id}`)).json()).data;
    expect(preview.cards[0].example).toBeUndefined();
    const edited = "我每天学习中文。 Tôi học tiếng Trung mỗi ngày.";
    await exampleInput.fill(edited);
    await dialog.getByRole("button", { name: t.applyExamples }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    const withExamples = (await (await page.request.get(`/api/v1/sets/${set.id}`)).json()).data;
    expect(withExamples.cards[0].example).toBe(edited);
    expect(withExamples.cards[0].phonetic).toBe("xué xí");
    expect(withExamples.cards[1].example).toBe(example);
  });
}
