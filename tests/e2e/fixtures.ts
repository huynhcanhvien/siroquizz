import { expect, type Page } from "@playwright/test";

/** Test-only credentials for the localStorage mock backend (never a real account). */
export const TEST_PASSWORD = "hocvui2026";

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@siroquizz.test`;
}

export async function registerUser(page: Page, name = "Bạn Test"): Promise<string> {
  const email = uniqueEmail();
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http") {
    // Each test represents a different remote client, preserving production rate-limit rules.
    await page
      .context()
      .setExtraHTTPHeaders({
        "x-forwarded-for": `198.51.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
      });
  }
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu").fill(TEST_PASSWORD);
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http") {
    // Sign-up hashes the password and sends mail; give it time while the server warms up.
    await expect(page).toHaveURL(/\/verify-email$/, { timeout: 15_000 });
    await page.goto(await emailLink(page, email, "verify-email"));
  }
  await expect(page).toHaveURL(/\/home$/);
  return email;
}

interface StoredSet {
  id: string;
  title: string;
  cards: Array<{ id: string; term: string; definition: string }>;
}

export async function readSets(page: Page): Promise<StoredSet[]> {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http") {
    const response = await page.request.get("/api/v1/sets?limit=50");
    return (await response.json()).data as StoredSet[];
  }
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("siroquizz:v1:sets") ?? "[]"));
}

export async function emailLink(page: Page, email: string, path: string): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const response = await page.request.get("http://localhost:8025/api/v1/messages?limit=200");
        const data = (await response.json()) as {
          messages: { ID: string; To: { Address: string }[] }[];
        };
        for (const message of data.messages.filter((item) =>
          item.To.some((to) => to.Address === email),
        )) {
          const detail = (await (
            await page.request.get(`http://localhost:8025/api/v1/message/${message.ID}`)
          ).json()) as { Text: string };
          const candidate = detail.Text.match(/https?:\/\/[^\s]+/g)?.find((url) =>
            url.includes(path),
          );
          if (candidate) {
            link = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return link;
}

export async function findSet(page: Page, titlePart: string): Promise<StoredSet> {
  const sets = await readSets(page);
  const set = sets.find((item) => item.title.includes(titlePart));
  if (!set) throw new Error(`Set containing "${titlePart}" not found`);
  return set;
}

/** term ↔ definition lookup in both directions for answering questions in tests. */
export function answerMap(set: StoredSet): Map<string, string> {
  return new Map(
    set.cards.flatMap(
      (card) =>
        [
          [card.term, card.definition],
          [card.definition, card.term],
        ] as const,
    ),
  );
}
