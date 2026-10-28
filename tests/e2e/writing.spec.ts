import { expect, test, type Browser, type Page } from "@playwright/test";
import { registerUser } from "./fixtures";

test.describe.configure({ timeout: 180_000 });
test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Writing needs the server backend");

async function person(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerUser(page, name);
  const headers = { Origin: new URL(page.url()).origin };
  const me = await (await page.request.get("/api/v1/me")).json();
  return { context, page, headers, id: me.data.id as string };
}
type Person = Awaited<ReturnType<typeof person>>;
const editor = (page: Page) => page.locator(".ql-editor");

async function classWith(teacher: Person, students: Person[]) {
  const created = await teacher.page.request.post("/api/v1/classes", {
    headers: teacher.headers,
    data: { name: "Lớp viết văn" },
  });
  const classId = (await created.json()).data.id as string;
  const detail = await (await teacher.page.request.get(`/api/v1/classes/${classId}`)).json();
  for (const student of students)
    await student.page.request.post("/api/v1/classes/join", {
      headers: student.headers,
      data: { code: detail.data.joinCode },
    });
  return classId;
}

test("a live writing session: roster, peer editing with colours, scratch cards to a set", async ({
  browser,
}) => {
  const teacher = await person(browser, "Cô Lan");
  const a = await person(browser, "Bạn An");
  const b = await person(browser, "Bạn Bình");
  const classId = await classWith(teacher, [a, b]);

  // The teacher creates a session from the class page and opens it.
  await teacher.page.goto(`/classes/${classId}`);
  await teacher.page.getByRole("link", { name: "Viết bài" }).click();
  await teacher.page.getByLabel("Tiêu đề").fill("Mùa thu quê em");
  await teacher.page.getByLabel("Đề bài").fill("Tả một buổi sáng mùa thu.");
  await teacher.page.getByRole("button", { name: "Tạo phiên" }).click();
  await teacher.page.getByRole("link", { name: "Xem" }).click();
  await expect(teacher.page).toHaveURL(/\/study\/writing\//);
  const sessionUrl = new URL(teacher.page.url()).pathname;
  await teacher.page.getByRole("button", { name: "Mở phiên" }).click();
  await expect(teacher.page.getByText("Đang mở").first()).toBeVisible();

  // A writes; the teacher's roster shows it within seconds.
  await a.page.goto(sessionUrl);
  await expect(a.page.getByText("Tả một buổi sáng mùa thu.")).toBeVisible();
  await editor(a.page).click();
  await a.page.keyboard.type("Mùa thu đến rồi");
  await expect(a.page.getByText("Đã lưu", { exact: true })).toBeVisible({ timeout: 15_000 });
  const roster = teacher.page.locator("aside");
  await expect(roster.getByText("Mùa thu đến rồi")).toBeVisible({ timeout: 15_000 });

  // The teacher lets students read and write in each other's documents.
  await roster.getByRole("switch", { name: "Cho phép xem bài nhau" }).click();
  await roster.getByRole("switch", { name: "Cho phép viết lên bài nhau" }).click();
  await expect(roster.getByRole("switch", { name: "Cho phép viết lên bài nhau" })).toBeChecked();

  // B opens A's document and adds to it.
  await b.page.goto(sessionUrl);
  await b.page
    .locator("aside")
    .getByRole("button", { name: /Bài của Bạn An/ })
    .click();
  await expect(editor(b.page)).toContainText("Mùa thu đến rồi", { timeout: 15_000 });
  await editor(b.page).click();
  await b.page.keyboard.press("ControlOrMeta+End");
  await b.page.keyboard.type(" lá vàng");

  // A sees B's words, marked as B's and coloured differently from A's own.
  const bText = editor(a.page).locator(`.ql-author-${b.id}`);
  await expect(bText).toContainText("lá vàng", { timeout: 20_000 });
  const colours = await a.page.evaluate(
    ({ aId, bId }) => {
      const colorOf = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).color : null;
      };
      return { own: colorOf(`.ql-author-${aId}`), peer: colorOf(`.ql-author-${bId}`) };
    },
    { aId: a.id, bId: b.id },
  );
  expect(colours.peer).not.toBeNull();
  expect(colours.peer).not.toBe(colours.own);

  // A saves two words from the text, which survive a reload.
  for (const [word, meaning] of [
    ["Mùa", "season"],
    ["thu", "autumn"],
  ]) {
    await editor(a.page).getByText("Mùa thu đến rồi").first().click();
    await a.page.evaluate((target) => {
      const root = document.querySelector(".ql-editor")!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.textContent!.indexOf(target);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
    }, word);
    await a.page.getByRole("button", { name: "Lưu từ vựng" }).click();
    const dialog = a.page.getByRole("dialog", { name: "Lưu" });
    await expect(dialog.getByLabel("Từ")).toHaveValue(word);
    await dialog.getByLabel("Nghĩa").fill(meaning);
    await dialog.getByRole("button", { name: "Lưu" }).click();
    await expect(dialog).toBeHidden();
  }
  await a.page.reload();
  await a.page.getByRole("button", { name: "Bộ thẻ tạm (2)" }).click();

  // A turns them into a set and finds it in the library.
  const drawer = a.page.getByRole("dialog", { name: "Bộ thẻ tạm" });
  await drawer.getByLabel("Chọn tất cả").check();
  await drawer.getByRole("button", { name: "Tạo bộ thẻ (2)" }).click();
  const create = a.page.getByRole("dialog", { name: "Tạo bộ thẻ từ thẻ tạm" });
  await create.getByLabel("Tên bộ thẻ").fill("Từ mùa thu");
  await create.getByRole("button", { name: "Tạo bộ thẻ (2)" }).click();
  await expect(a.page).toHaveURL(/\/sets\//);
  await a.page.goto("/library");
  await expect(a.page.getByText("Từ mùa thu")).toBeVisible();
});

test("edits typed while offline are kept across a reload", async ({ browser }) => {
  const teacher = await person(browser, "Thầy Minh");
  const student = await person(browser, "Bạn Chi");
  const classId = await classWith(teacher, [student]);
  const session = await teacher.page.request.post(`/api/v1/classes/${classId}/writing`, {
    headers: teacher.headers,
    data: { title: "Nhật ký" },
  });
  const sessionId = (await session.json()).data.id as string;
  await teacher.page.request.patch(`/api/v1/writing/sessions/${sessionId}`, {
    headers: teacher.headers,
    data: { status: "open" },
  });
  await student.page.goto(`/study/writing/${sessionId}`);
  await editor(student.page).click();
  await student.page.keyboard.type("Đã lưu trước. ");
  await expect(student.page.getByText("Đã lưu", { exact: true })).toBeVisible({ timeout: 15_000 });
  await student.context.setOffline(true);
  await student.page.keyboard.type("Viết khi mất mạng.");
  await expect(student.page.getByText("Mất kết nối, sẽ thử lại")).toBeVisible({ timeout: 15_000 });
  await student.context.setOffline(false);
  await student.page.reload();
  await expect(editor(student.page)).toContainText("Đã lưu trước. Viết khi mất mạng.", {
    timeout: 15_000,
  });
  await expect(student.page.getByText("Đã lưu", { exact: true })).toBeVisible({ timeout: 15_000 });
});
