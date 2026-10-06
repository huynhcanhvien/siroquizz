import { expect, test } from "@playwright/test";
import { answerMap, findSet, registerUser } from "./fixtures";

test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Ranked games need the server backend");

test("a fairly played Match game is verified and reaches the leaderboard", async ({ page }) => {
  test.setTimeout(60_000);
  await registerUser(page, "Tay Nhanh");
  const set = await findSet(page, "HSK");
  const answers = answerMap(set);
  await page.goto(`/study/${set.id}/games/match`);
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  const tiles = page.locator("ul button:not([disabled])");
  await expect(tiles.first()).toBeVisible();
  while ((await tiles.count()) > 0) {
    const first = tiles.first();
    const text = ((await first.textContent()) ?? "").trim();
    // A person needs a moment per pair; the server rejects anything under 300 ms.
    await page.waitForTimeout(450);
    await first.click();
    await page
      .locator("ul button:not([disabled])")
      .filter({ hasText: new RegExp(`^${answers.get(text)}$`) })
      .click();
  }
  await expect(page.getByRole("heading", { name: "Hoàn thành!" })).toBeVisible();
  await expect(page.getByText("Kết quả đã được xác minh và ghi lên bảng xếp hạng.")).toBeVisible();
  const board = page
    .getByRole("region", { name: "Bảng xếp hạng" })
    .or(page.locator("section", { has: page.getByRole("heading", { name: "Bảng xếp hạng" }) }));
  await expect(board.getByText("Tay Nhanh (Bạn)")).toBeVisible();
});

test("a forged game is replayed by the server and kept off the leaderboard", async ({ page }) => {
  await registerUser(page, "Gian Lận");
  const headers = { Origin: new URL(page.url()).origin };
  const set = await findSet(page, "HSK");
  const session = await (
    await page.request.post(`/api/v1/sets/${set.id}/game-sessions`, {
      headers,
      data: { game: "match" },
    })
  ).json();
  // Claims a near-instant finish clicking tiles that don't exist on the seeded board.
  const forged = await page.request.post(`/api/v1/game-sessions/${session.data.id}/finish`, {
    headers,
    data: {
      events: [
        { t: 10, tileId: "fake:term" },
        { t: 20, tileId: "fake:definition" },
      ],
    },
  });
  expect((await forged.json()).data).toEqual({ verified: false, reason: "invalid_event" });
  const board = await (
    await page.request.get(`/api/v1/sets/${set.id}/leaderboard?game=match`)
  ).json();
  expect(board.data.entries).toEqual([]);
});
