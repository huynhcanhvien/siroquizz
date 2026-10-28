import { readFile } from "node:fs/promises";
import { expect, test, type Browser } from "@playwright/test";
import { registerUser } from "./fixtures";

// These tests sign up several people each; 30s is tight while the whole suite runs in parallel.
test.describe.configure({ timeout: 90_000 });

test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Classes need the server backend");

async function person(browser: Browser, name: string) {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await registerUser(page, name);
  return { page, headers: { Origin: new URL(page.url()).origin } };
}

test("teacher assigns a private set, the student studies it, progress shows up", async ({
  browser,
}) => {
  const teacher = await person(browser, "Cô Hạnh");
  const title = `Từ vựng lớp ${Date.now().toString(36)}`;
  const created = await teacher.page.request.post("/api/v1/sets", {
    headers: teacher.headers,
    data: {
      title,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: [
        { term: "apple", definition: "quả táo" },
        { term: "pear", definition: "quả lê" },
      ],
    },
  });
  const setId = (await created.json()).data.id as string;

  await teacher.page.goto("/classes");
  await teacher.page.getByLabel("Tên lớp").fill("Tiếng Anh 10A");
  await teacher.page.getByRole("button", { name: "Tạo lớp" }).click();
  await expect(
    teacher.page.getByRole("heading", { level: 1, name: "Tiếng Anh 10A" }),
  ).toBeVisible();
  const code = (await teacher.page.locator("span.font-mono").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await teacher.page
    .getByRole("combobox", { name: "Bộ thẻ", exact: true })
    .selectOption({ label: title });
  const dueDate = new Date();
  const due = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;
  await teacher.page.getByLabel("Hạn chót (không bắt buộc)").fill(due);
  await teacher.page.getByRole("button", { name: "Giao", exact: true }).click();
  await expect(teacher.page.getByText("Đã giao bộ thẻ.")).toBeVisible();
  const teacherCalendar = teacher.page.getByRole("region", { name: "Lịch deadline" });
  await expect(teacherCalendar.getByRole("link", { name: `Học bộ thẻ ${title}` })).toHaveAttribute(
    "href",
    `/sets/${setId}`,
  );

  // The student joins through the invite link and sees the assignment on Home.
  const student = await person(browser, "Bé Na");
  await student.page.goto(`/classes/join/${code}`);
  await student.page.getByRole("button", { name: "Tham gia" }).click();
  await expect(
    student.page.getByRole("heading", { level: 1, name: "Tiếng Anh 10A" }),
  ).toBeVisible();
  await expect(student.page.getByText("Học sinh · Giáo viên: Cô Hạnh")).toBeVisible();
  await expect(
    student.page
      .getByRole("region", { name: "Lịch deadline" })
      .getByRole("link", { name: `Học bộ thẻ ${title}` }),
  ).toBeVisible();
  await student.page.goto("/home");
  const assignment = student.page.getByRole("link", { name: new RegExp(title) });
  await expect(assignment).toContainText("Đã thuộc 0/2");
  await assignment.click();
  // Students study but cannot edit or share the teacher's set.
  await expect(student.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(student.page.getByRole("link", { name: "Chỉnh sửa", exact: true })).toHaveCount(0);
  await expect(student.page.getByRole("button", { name: /Chia sẻ/ })).toHaveCount(0);
  await student.page.goto(`/study/${setId}/flashcards`);
  await student.page.getByRole("button", { name: "Đã biết" }).click();
  await student.page.getByRole("button", { name: "Đã biết" }).click();
  await expect(student.page.getByText("Bạn đã học hết một vòng!")).toBeVisible();

  // The teacher's board now shows the student's progress, and exports it.
  await teacher.page.reload();
  const progress = teacher.page.getByRole("table", { name: "Tiến độ" });
  await expect(progress.getByRole("row", { name: /Bé Na/ })).toContainText("100%");
  const download = teacher.page.waitForEvent("download");
  await teacher.page.getByRole("button", { name: "Xuất CSV" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain('"Bé Na"');
  expect(csv).toContain(`"${title}","100"`);

  // Leaving the class removes access to the private set.
  await student.page.goto("/classes");
  await student.page.getByRole("link", { name: /Tiếng Anh 10A/ }).click();
  await student.page.getByRole("button", { name: "Rời lớp" }).click();
  await student.page.getByRole("button", { name: "Đồng ý" }).click();
  await expect(student.page).toHaveURL(/\/classes$/);
  await student.page.goto(`/sets/${setId}`);
  await expect(student.page.getByText("Không tìm thấy bộ thẻ")).toBeVisible();
});
