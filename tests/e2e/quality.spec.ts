import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { findSet, registerUser } from "./fixtures";

const BREAKPOINTS = [320, 768, 1024, 1440] as const;

/** Shares a set by link and picks a username, for the public pages. */
async function publicPages(page: Page, setId: string) {
  const headers = { Origin: new URL(page.url()).origin };
  const shared = await page.request.patch(`/api/v1/sets/${setId}/visibility`, {
    headers,
    data: { visibility: "unlisted" },
  });
  const username = `qa_${Date.now().toString(36)}`;
  await page.request.patch("/api/v1/me/profile", { headers, data: { username } });
  return [
    { name: "explore", path: "/explore" },
    { name: "shared-set", path: `/s/${(await shared.json()).data.slug}` },
    { name: "profile", path: `/u/${username}` },
    { name: "folders", path: "/folders" },
  ];
}

async function pagesToCheck(page: Page) {
  await registerUser(page);
  const set = await findSet(page, "HSK");
  return [
    { name: "home", path: "/home" },
    { name: "library", path: "/library" },
    { name: "set", path: `/sets/${set.id}` },
    { name: "editor", path: `/sets/${set.id}/edit` },
    { name: "flashcards", path: `/study/${set.id}/flashcards` },
    { name: "test-setup", path: `/study/${set.id}/test` },
    { name: "games", path: `/study/${set.id}/games` },
    { name: "ai", path: "/sets/new/ai" },
    { name: "settings", path: "/settings" },
    ...(process.env.NEXT_PUBLIC_DATA_SOURCE === "http"
      ? [
          { name: "stats", path: "/stats" },
          { name: "review", path: "/review" },
          ...(await publicPages(page, set.id)),
        ]
      : []),
  ];
}

test("has no horizontal overflow at key breakpoints and saves screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  const pages = await pagesToCheck(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of BREAKPOINTS) {
      await page.setViewportSize({ width, height: 900 });
      for (const target of [{ name: "landing", path: "/" }, ...pages]) {
        await page.goto(target.path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect.soft(overflow, `${target.name} @ ${width}px (${scheme})`).toBeLessThanOrEqual(0);
        if (width === 320 || width === 1440) {
          await page.screenshot({
            path: `test-results/screens/${target.name}-${width}-${scheme}.png`,
            fullPage: true,
          });
        }
      }
    }
  }
});

test("passes automated accessibility checks (WCAG 2.1 AA)", async ({ page }) => {
  test.setTimeout(120_000);
  const pages = await pagesToCheck(page);
  for (const target of [{ name: "landing", path: "/" }, ...pages]) {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(target.path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const summary = results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(" "))
            .slice(0, 3)
            .join(", ")}`,
      );
      expect.soft(summary, `${target.name} (${scheme})`).toEqual([]);
    }
  }
});

test("login page also passes accessibility checks", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
