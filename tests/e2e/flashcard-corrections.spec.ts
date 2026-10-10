import { expect, test } from "@playwright/test";
import vi from "../../messages/vi.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { findSet, registerUser } from "./fixtures";

const messages = { vi, en, zh };
for (const locale of ["vi", "en", "zh"] as const) {
  test(`${locale}: correct previous and final flashcards on a narrow phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await registerUser(page);
    const set = await findSet(page, "IELTS");
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: locale, url: new URL(page.url()).origin }]);
    await page.goto(`/study/${set.id}/flashcards`);
    const t = messages[locale].flashcards;
    const previous = page.getByRole("button", { name: t.prev, exact: true });
    const known = page.getByRole("button", { name: t.known, exact: true });
    const learning = page.getByRole("button", { name: t.learning, exact: true });
    const face = page.locator(".flip-face:not([aria-hidden=true])");
    await expect(previous).toBeDisabled();
    await known.click();
    await expect(face).toContainText(set.cards[1].term);
    await previous.click();
    await expect(face).toContainText(set.cards[0].term);
    await learning.click();
    for (const card of set.cards.slice(1)) {
      await expect(face).toContainText(card.term);
      await known.click();
    }
    await expect(page.getByRole("heading", { name: t.summaryTitle })).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(set.cards.length - 1),
    );
    await previous.click();
    await expect(face).toContainText(set.cards.at(-1)!.term);
    await learning.click();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(set.cards.length - 2),
    );
    await expect
      .poll(async () => {
        if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http") {
          const response = await page.request.get(`/api/v1/sets/${set.id}/progress`);
          expect(response.ok()).toBe(true);
          const { data } = (await response.json()) as {
            data: { cardId: string; status: string }[];
          };
          return [set.cards[0].id, set.cards.at(-1)!.id].map(
            (id) => data.find((entry) => entry.cardId === id)?.status,
          );
        }
        return page.evaluate(
          ({ first, last }) => {
            const progress: { cardId: string; status: string }[] = JSON.parse(
              localStorage.getItem("siroquizz:v1:progress") ?? "[]",
            );
            return [first, last].map((id) => progress.find((entry) => entry.cardId === id)?.status);
          },
          { first: set.cards[0].id, last: set.cards.at(-1)!.id },
        );
      })
      .toEqual(["learning", "learning"]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
