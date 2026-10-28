import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { registerUser } from "./fixtures";

test.describe.configure({ timeout: 240_000 });
test.skip(process.env.NEXT_PUBLIC_DATA_SOURCE !== "http", "Collaboration needs the server backend");

const WIDTHS = [375, 1440] as const;

async function person(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await registerUser(page, name);
  return { page, headers: { Origin: new URL(page.url()).origin } };
}
type Person = Awaited<ReturnType<typeof person>>;

function send(who: Person, url: string, data: unknown, method = "POST") {
  return who.page.request.fetch(url, { method, headers: who.headers, data });
}

/** A class with a student-shared set and an open writing session, built through the API. */
async function classFixture(teacher: Person, student: Person) {
  const klass = await (await send(teacher, "/api/v1/classes", { name: "Lớp QA" })).json();
  const classId = klass.data.id as string;
  const detail = await (await teacher.page.request.get(`/api/v1/classes/${classId}`)).json();
  await send(student, "/api/v1/classes/join", { code: detail.data.joinCode });
  const set = await send(student, "/api/v1/sets", {
    title: "Bộ QA",
    description: "",
    termLang: "en",
    definitionLang: "vi",
    source: "manual",
    cards: [
      { term: "river", definition: "dòng sông" },
      { term: "mountain", definition: "ngọn núi" },
    ],
  });
  const setId = (await set.json()).data.id as string;
  const share = { itemType: "set", itemId: setId, audience: "class" };
  expect((await send(student, `/api/v1/classes/${classId}/library`, share, "PUT")).ok()).toBe(true);
  const session = await send(teacher, `/api/v1/classes/${classId}/writing`, { title: "Nhật ký" });
  const sessionId = (await session.json()).data.id as string;
  await send(teacher, `/api/v1/writing/sessions/${sessionId}`, { status: "open" }, "PATCH");
  return { classId, setId, sessionId };
}

async function collabPages(browser: Browser) {
  const teacher = await person(browser, "Cô QA");
  const student = await person(browser, "Bạn QA");
  const { classId, setId, sessionId } = await classFixture(teacher, student);
  return [
    { who: teacher.page, name: "class-teacher", path: `/classes/${classId}` },
    { who: student.page, name: "class-student", path: `/classes/${classId}` },
    { who: teacher.page, name: "writing-list", path: `/classes/${classId}/writing` },
    { who: teacher.page, name: "propose", path: `/sets/${setId}/propose` },
    { who: teacher.page, name: "set-viewer", path: `/sets/${setId}` },
    { who: student.page, name: "library-class", path: "/library?tab=class" },
    { who: teacher.page, name: "writing-teacher", path: `/study/writing/${sessionId}` },
    { who: student.page, name: "writing-student", path: `/study/writing/${sessionId}` },
  ];
}

async function settle(page: Page, path: string) {
  await page.goto(path);
  // Writing pages keep polling, so wait for the main landmark instead of network idle.
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
}

function summarize(violations: { id: string; nodes: { target: unknown[] }[] }[]) {
  return violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes
        .map((node) => node.target.join(" "))
        .slice(0, 3)
        .join(", ")}`,
  );
}

test("collaboration and writing pages fit 375/1440 and pass axe (WCAG 2.1 AA)", async ({
  browser,
}) => {
  const pages = await collabPages(browser);
  for (const target of pages) {
    for (const scheme of ["light", "dark"] as const) {
      await target.who.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      for (const width of WIDTHS) {
        await target.who.setViewportSize({ width, height: 900 });
        await settle(target.who, target.path);
        const overflow = await target.who.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect.soft(overflow, `${target.name} @ ${width}px (${scheme})`).toBeLessThanOrEqual(0);
        if (width !== 1440) continue;
        const results = await new AxeBuilder({ page: target.who })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect.soft(summarize(results.violations), `${target.name} (${scheme})`).toEqual([]);
      }
    }
  }
});
