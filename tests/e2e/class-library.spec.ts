import { expect, test, type Browser, type Page } from "@playwright/test";
import { registerUser } from "./fixtures";

test.describe.configure({ timeout: 90_000 });
test.skip(
  process.env.NEXT_PUBLIC_DATA_SOURCE !== "http",
  "Class libraries need the server backend",
);

async function person(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await registerUser(page, name);
  return { page, headers: { Origin: new URL(page.url()).origin } };
}
type Person = Awaited<ReturnType<typeof person>>;

async function createClassWithStudent(teacher: Person, student: Person) {
  await teacher.page.goto("/classes");
  await teacher.page.getByLabel("Tên lớp").fill("Văn 11B");
  await teacher.page.getByRole("button", { name: "Tạo lớp" }).click();
  await expect(teacher.page.getByRole("heading", { level: 1, name: "Văn 11B" })).toBeVisible();
  const classUrl = teacher.page.url();
  const code = (await teacher.page.locator("span.font-mono").textContent())!.trim();
  await student.page.goto(`/classes/join/${code}`);
  await student.page.getByRole("button", { name: "Tham gia" }).click();
  await expect(student.page.getByRole("heading", { level: 1, name: "Văn 11B" })).toBeVisible();
  return classUrl;
}
async function createSet(owner: Person, title: string) {
  const response = await owner.page.request.post("/api/v1/sets", {
    headers: owner.headers,
    data: {
      title,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: [
        { term: "river", definition: "dòng sông" },
        { term: "mountain", definition: "ngọn núi" },
      ],
    },
  });
  return (await response.json()).data.id as string;
}
/** Shares an item to the class through its owner's share dialog ("Classes" tab when present). */
async function shareToClass(page: Page, withTabs: boolean) {
  await page
    .getByRole("button", { name: /^Chia sẻ/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  if (withTabs) await dialog.getByText("Lớp học", { exact: true }).click();
  await dialog.getByRole("switch", { name: "Văn 11B" }).click();
  await expect(page.getByText("Đã chia sẻ vào lớp.")).toBeVisible();
  await page.keyboard.press("Escape");
}

test("students share sets and folders; teachers suggest edits and collaborate", async ({
  browser,
}) => {
  const teacher = await person(browser, "Cô Hạnh");
  const student = await person(browser, "Bé Na");
  const classUrl = await createClassWithStudent(teacher, student);
  const title = `Địa lý ${Date.now().toString(36)}`;
  const setId = await createSet(student, title);

  // 1. The student shares the set with the whole class.
  await student.page.goto(`/sets/${setId}`);
  await shareToClass(student.page, true);

  // 2. The teacher finds it in the class library and suggests an edit.
  await teacher.page.goto(classUrl);
  const library = teacher.page.getByRole("region", { name: "Thư viện lớp" });
  await expect(library.getByText("Chia sẻ bởi Bé Na")).toBeVisible();
  await library.getByRole("link", { name: title }).click();
  await teacher.page.getByRole("link", { name: "Đề xuất chỉnh sửa" }).click();
  const definitions = teacher.page.getByLabel("Định nghĩa", { exact: true });
  await definitions.first().fill("con sông");
  await teacher.page.getByRole("button", { name: "Gửi đề xuất" }).first().click();
  await expect(teacher.page.getByText("Đã gửi đề xuất.")).toBeVisible();

  // 3. The student reviews it from Home and approves.
  await student.page.goto("/home");
  const waiting = student.page.getByRole("region", { name: "Chờ bạn duyệt" });
  await waiting.getByRole("link", { name: new RegExp(title) }).click();
  await expect(student.page.getByRole("heading", { name: "Đề xuất chờ duyệt (1)" })).toBeVisible();
  await expect(student.page.getByText("Cô Hạnh đề xuất")).toBeVisible();
  await student.page.getByRole("button", { name: "Duyệt" }).click();
  await expect(student.page.getByText("Đã duyệt và áp dụng thay đổi.")).toBeVisible();
  await expect(student.page.getByText("con sông").first()).toBeVisible();
  await teacher.page.goto(`/sets/${setId}`);
  await expect(teacher.page.getByText("con sông").first()).toBeVisible();

  // 4. The student lets every teacher of the class edit directly.
  await student.page.getByRole("button", { name: "Tùy chọn khác" }).click();
  await student.page.getByRole("menuitem", { name: "Cộng tác viên" }).click();
  await student.page.getByRole("switch", { name: "Tất cả giáo viên" }).click();
  await expect(student.page.getByText("Đã lưu.")).toBeVisible();
  await teacher.page.reload();
  await teacher.page.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
  await teacher.page.getByLabel("Định nghĩa", { exact: true }).nth(1).fill("dãy núi");
  await teacher.page.getByRole("button", { name: "Lưu thay đổi" }).first().click();
  await expect(teacher.page.getByText("Đã lưu thay đổi.")).toBeVisible();

  // 5. A shared folder opens read-only for the teacher, who can study it.
  const folder = await student.page.request.post("/api/v1/folders", {
    headers: student.headers,
    data: { name: "Ôn thi" },
  });
  const folderId = (await folder.json()).data.id as string;
  await student.page.request.put(`/api/v1/folders/${folderId}/sets/${setId}`, {
    headers: student.headers,
  });
  await student.page.goto(`/folders/${folderId}`);
  await shareToClass(student.page, false);
  await teacher.page.goto(`/folders/${folderId}`);
  await expect(teacher.page.getByRole("heading", { level: 1, name: "Ôn thi" })).toBeVisible();
  await expect(teacher.page.getByRole("button", { name: "Đổi tên" })).toHaveCount(0);
  await teacher.page.goto(`/study/folder/${folderId}/flashcards`);
  await expect(
    teacher.page.getByText("dòng sông").or(teacher.page.getByText("river")).first(),
  ).toBeVisible();
});
