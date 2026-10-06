import { expect, test, type Locator, type Page } from "@playwright/test";
import { answerMap, findSet, registerUser } from "./fixtures";

async function answerQuestion(question: Locator, answers: Map<string, string>) {
  const title = (await question.getByRole("heading", { level: 2 }).textContent()) ?? "";
  if (title.includes("Ghép nối")) {
    const columns = question.getByRole("list");
    const prompts = columns.nth(0).getByRole("button");
    for (let i = 0; i < (await prompts.count()); i += 1) {
      const prompt = prompts.nth(i);
      const expected = answers.get(((await prompt.textContent()) ?? "").replace(/^\d+/, "").trim());
      await prompt.click();
      await columns.nth(1).getByRole("button").filter({ hasText: expected }).click();
    }
    return;
  }
  const prompt = ((await question.locator("p").first().textContent()) ?? "").trim();
  const expected = answers.get(prompt) ?? "";
  if (title.includes("Trắc nghiệm")) {
    await question.locator("label").filter({ hasText: new RegExp(`^\\d+${expected}$`) }).click();
  } else if (title.includes("Đúng / Sai")) {
    const candidate = ((await question.locator("p").nth(1).textContent()) ?? "").trim();
    await question.getByText(candidate === expected ? "Đúng" : "Sai", { exact: true }).click();
  } else {
    await question.getByRole("textbox").fill(expected);
  }
}

async function openSetMode(page: Page, title: string, path: string) {
  const set = await findSet(page, title);
  await page.goto(`/study/${set.id}/${path}`);
  return set;
}

test("takes a test with all four question types and gets a perfect score", async ({ page }) => {
  await registerUser(page);
  const set = await openSetMode(page, "IELTS", "test");
  const answers = answerMap(set);

  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  const questions = page.locator("section[id^=question-]");
  await expect(questions.first()).toBeVisible();
  for (let i = 0; i < (await questions.count()); i += 1) await answerQuestion(questions.nth(i), answers);

  await expect(page.getByText(/^(\d+)\/\1 đã trả lời$/)).toBeVisible();
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.getByRole("heading", { name: "Xuất sắc!" })).toBeVisible();
  await expect(page.getByText(/^(\d+)\/\1 đúng$/)).toBeVisible();
  await expect(page.getByText("Không sai câu nào. Tuyệt vời!")).toBeVisible();
});

test("asks for confirmation when submitting an unfinished test", async ({ page }) => {
  await registerUser(page);
  await openSetMode(page, "Du lịch", "test");
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.getByRole("dialog", { name: "Nộp bài khi còn câu chưa làm?" })).toBeVisible();
  await page.getByRole("button", { name: "Vẫn nộp bài" }).click();
  await expect(page.getByRole("heading", { name: "Câu cần xem lại" })).toBeVisible();
});

test("finishes the Match game and records the time", async ({ page }) => {
  await registerUser(page);
  const set = await openSetMode(page, "HSK", "games/match");
  const answers = answerMap(set);
  await page.getByRole("button", { name: "Bắt đầu" }).click();

  const tiles = page.locator("ul button:not([disabled])");
  // Starting asks the server for a ranked game first; wait for the board.
  await tiles.first().waitFor();
  while ((await tiles.count()) > 0) {
    const first = tiles.first();
    const text = ((await first.textContent()) ?? "").trim();
    await first.click();
    await page.locator("ul button:not([disabled])").filter({ hasText: new RegExp(`^${answers.get(text)}$`) }).click();
  }
  await expect(page.getByRole("heading", { name: "Hoàn thành!" })).toBeVisible();
  await expect(page.getByText("Kỷ lục mới!")).toBeVisible();
});

test("plays Scramble with keyboard input", async ({ page }) => {
  await registerUser(page);
  await openSetMode(page, "IELTS", "games/scramble");
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  const set = await findSet(page, "IELTS");
  const byDefinition = new Map(set.cards.map((card) => [card.definition, card.term]));
  const clue = ((await page.locator("p[lang=vi]").first().textContent()) ?? "").trim();
  await page.keyboard.type(byDefinition.get(clue) ?? "");
  await expect(page.getByText("Chính xác!")).toBeVisible();
});

test("Gravity words fall over time and a correct answer scores points", async ({ page }) => {
  await registerUser(page);
  const set = await openSetMode(page, "IELTS", "games/gravity");
  const byDefinition = new Map(set.cards.map((card) => [card.definition, card.term]));
  await page.getByRole("button", { name: "Bắt đầu" }).click();

  const falling = page.locator("[style*=translateY]");
  const offsetOf = async () => (await falling.boundingBox())?.y ?? 0;
  const startY = await offsetOf();
  await expect.poll(offsetOf, { timeout: 5000 }).toBeGreaterThan(startY + 20);

  const prompt = ((await falling.textContent()) ?? "").trim();
  await page.getByLabel("Gõ đáp án rồi nhấn Enter").fill(byDefinition.get(prompt) ?? "");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Điểm", { exact: true }).locator("..")).toContainText("10");
  await expect(page.getByText(/Chính xác! Điểm: 10\./)).toBeAttached();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Tiếp tục" }).first()).toBeVisible();
});

test("Memory keeps matching pairs face up and finishes", async ({ page }) => {
  await registerUser(page);
  const set = await openSetMode(page, "Du lịch", "games/memory");
  const answers = answerMap(set);
  await page.getByRole("button", { name: "Bắt đầu" }).click();

  // Reveal every card once (pairs that don't match flip back after a short delay) to learn positions.
  const cards = page.locator("ul button");
  const count = await cards.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i += 2) {
    await cards.nth(i).click();
    await cards.nth(i + 1).click();
    texts[i] = (await cards.nth(i).getAttribute("aria-label")) ?? "";
    texts[i + 1] = (await cards.nth(i + 1).getAttribute("aria-label")) ?? "";
    // Wait for a mismatched pair to flip back (MISMATCH_HIDE_DELAY_MS = 800).
    await page.waitForTimeout(900);
  }
  const finished = page.getByRole("heading", { name: "Hoàn thành!" });
  // Read every card's state in one call: the board unmounts as soon as the last pair is found,
  // so per-element waits (isDisabled, click) would hang on elements that no longer exist.
  for (let attempt = 0; attempt < count && !(await finished.isVisible()); attempt += 1) {
    const disabled = await cards.evaluateAll((elements) => elements.map((element) => (element as HTMLButtonElement).disabled));
    const first = disabled.findIndex((value) => !value);
    if (first < 0) break;
    const partner = texts.findIndex((text, index) => index !== first && !disabled[index] && text === answers.get(texts[first]));
    await cards.nth(first).click();
    await cards.nth(partner).click();
  }
  await expect(page.getByRole("heading", { name: "Hoàn thành!" })).toBeVisible();
});

test("retaking mistakes builds full multiple-choice questions from the whole set", async ({ page }) => {
  await registerUser(page);
  await openSetMode(page, "IELTS", "test");
  await page.getByText("Tự luận", { exact: true }).click();
  await page.getByText("Đúng / Sai", { exact: true }).click();
  await page.getByText("Ghép nối", { exact: true }).click();
  await page.getByLabel("Số câu hỏi").fill("1");
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await page.getByRole("button", { name: "Vẫn nộp bài" }).click();

  await page.getByRole("button", { name: "Làm lại câu sai" }).click();
  const options = page.locator("section[id^=question-] label");
  await expect(options).toHaveCount(4);
});
