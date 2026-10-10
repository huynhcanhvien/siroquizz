import { expect, test } from "@playwright/test";
import vi from "../../messages/vi.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { findSet, registerUser } from "./fixtures";

const messages = { vi, en, zh };
for (const locale of ["vi", "en", "zh"] as const) {
  test(`${locale}: star flashcards on either face without flipping or advancing`, async ({
    page,
  }) => {
    test.skip(
      process.env.NEXT_PUBLIC_DATA_SOURCE !== "http",
      "Stars use the server-backed repository",
    );
    await page.setViewportSize({ width: 320, height: 740 });
    await registerUser(page);
    const set = await findSet(page, "IELTS");
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: locale, url: new URL(page.url()).origin }]);
    await page.goto(`/study/${set.id}/flashcards`);
    const t = messages[locale];
    const star = () => page.getByRole("button", { name: t.learning.star, exact: true });
    const unstar = () => page.getByRole("button", { name: t.learning.unstar, exact: true });
    const face = page.locator(".flip-face:not([aria-hidden=true])");
    await star().click();
    await expect(unstar()).toHaveAttribute("aria-pressed", "true");
    await expect(unstar()).toBeEnabled();
    await expect(face).toContainText(set.cards[0].term);
    await page.getByRole("button", { name: t.flashcards.flip, exact: true }).click();
    await unstar().click();
    await expect(star()).toBeEnabled();
    await expect(face).toContainText(set.cards[0].definition);
    // A focused star control owns Space; the deck must not also flip the card.
    await star().focus();
    await page.keyboard.press("Space");
    await expect(unstar()).toBeEnabled();
    await expect(face).toContainText(set.cards[0].definition);
    await page.getByRole("button", { name: t.flashcards.known, exact: true }).click();
    await expect(face).toContainText(set.cards[1].term);
    await expect(star()).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: t.flashcards.prev, exact: true }).click();
    await expect(unstar()).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(unstar()).toHaveAttribute("aria-pressed", "true");
    await unstar().click();
    await expect(star()).toBeEnabled();
    await page.reload();
    await expect(star()).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
