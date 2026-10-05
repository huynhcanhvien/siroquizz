import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createSetInTransaction } from "@/server/services/sets";
import { copyPublicSet, setTags, setVisibility } from "@/server/services/sharing";
import {
  exploreQuerySchema,
  popularThisWeek,
  searchSets,
  topTags,
} from "@/server/services/explore";
import {
  getProfileSettings,
  getPublicProfile,
  updateProfileSettings,
} from "@/server/services/profiles";

vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: vi.fn(async () => ({
    data: { violation: false, category: "safe", reason: "ok" },
    usage: {},
    model: "m",
  })),
}));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ AI_GLOBAL_DAILY_CREDITS: 480 }) }));

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  author = v7(),
  reader = v7();

const cards = (prefix: string, count = 10) =>
  Array.from({ length: count }, (_, i) => ({ term: `${prefix} ${i}`, definition: `nghĩa ${i}` }));
async function makeSet(
  title: string,
  options: {
    owner?: string;
    visibility?: "private" | "unlisted" | "public";
    termLang?: string;
    setCards?: { term: string; definition: string }[];
  } = {},
) {
  const owner = options.owner ?? author;
  const set = await db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title,
      description: "",
      termLang: options.termLang ?? "en",
      definitionLang: "vi",
      source: "manual",
      cards: options.setCards ?? cards(title),
    }),
  );
  if (options.visibility && options.visibility !== "private")
    await setVisibility(db, owner, set.id, { visibility: options.visibility });
  return set.id;
}
const search = async (params: Record<string, unknown>) =>
  (await searchSets(db, exploreQuerySchema.parse(params))).items.map((item) => item.title);

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: author, name: "Tác giả", email: "x-author@example.com", emailVerified: true },
    { id: reader, name: "Người đọc", email: "x-reader@example.com", emailVerified: true },
  ]);
});
afterAll(() => connection.end());

describe("Explore", () => {
  it("finds Vietnamese titles without accents and Chinese terms", async () => {
    await makeSet("Từ vựng du lịch", { visibility: "public" });
    await makeSet("Greetings", {
      visibility: "public",
      termLang: "zh",
      setCards: [
        { term: "你好", definition: "Xin chào" },
        { term: "再见", definition: "Tạm biệt" },
      ],
    });
    expect(await search({ q: "tu vung du lich" })).toEqual(["Từ vựng du lịch"]);
    expect(await search({ q: "TỪ VỰNG" })).toEqual(["Từ vựng du lịch"]);
    expect(await search({ q: "你好" })).toEqual(["Greetings"]);
    expect(await search({ q: "tam biet" })).toEqual(["Greetings"]);
    expect(await search({ q: "100%_" })).toEqual([]);
  });
  it("shows only approved public sets of people in good standing", async () => {
    await makeSet("Shown words", { visibility: "public" });
    await makeSet("Private words");
    await makeSet("Unlisted words", { visibility: "unlisted" });
    const hidden = await makeSet("Hidden words", { visibility: "public" });
    await db
      .update(schema.studySets)
      .set({ hiddenAt: new Date() })
      .where(eq(schema.studySets.id, hidden));
    const flagged = await makeSet("Flagged words", { visibility: "public" });
    await db
      .update(schema.studySets)
      .set({ moderationStatus: "flagged" })
      .where(eq(schema.studySets.id, flagged));
    await makeSet("Banned author words", { owner: reader, visibility: "public" });
    await db.update(schema.user).set({ bannedAt: new Date() }).where(eq(schema.user.id, reader));
    expect(await search({ q: "words" })).toEqual(["Shown words"]);
  });
  it("filters by languages, size and tag, ignoring junk parameters", async () => {
    await makeSet("English small", { visibility: "public" });
    const chinese = await makeSet("Chinese big", {
      visibility: "public",
      termLang: "zh",
      setCards: cards("chữ", 60),
    });
    await setTags(db, author, chinese, { tags: ["HSK 2", " hsk 2 ", "Travel"] });
    expect(await search({ termLang: "zh" })).toEqual(["Chinese big"]);
    expect(await search({ size: "small" })).toEqual(["English small"]);
    expect(await search({ size: "large" })).toEqual(["Chinese big"]);
    expect(await search({ tag: "HSK 2" })).toEqual(["Chinese big"]);
    expect((await search({ termLang: "xx", size: "huge", page: "-3" })).sort()).toEqual([
      "Chinese big",
      "English small",
    ]);
    expect(await topTags(db)).toEqual(["hsk 2", "travel"]);
  });
  it("ranks by copies made this week and lists them as popular", async () => {
    await makeSet("Quiet set", { visibility: "public" });
    const loved = await makeSet("Loved set", { visibility: "public" });
    const slug = (await db.select().from(schema.studySets).where(eq(schema.studySets.id, loved)))[0]
      .slug!;
    await copyPublicSet(db, reader, slug);
    await copyPublicSet(db, reader, slug);
    expect(await search({ sort: "popular" })).toEqual(["Loved set", "Quiet set"]);
    const popular = await popularThisWeek(db);
    expect(popular.map((item) => [item.title, item.copiesThisWeek])).toEqual([["Loved set", 2]]);
    // Copies are private and never show up themselves.
    expect(await search({ q: "loved" })).toEqual(["Loved set"]);
  });
  it("pages results", async () => {
    for (let i = 0; i < 26; i++) await makeSet(`Bulk set ${i}`, { visibility: "public" });
    const first = await searchSets(db, exploreQuerySchema.parse({ q: "bulk", sort: "new" }));
    const second = await searchSets(
      db,
      exploreQuerySchema.parse({ q: "bulk", sort: "new", page: 2 }),
    );
    expect(first.items).toHaveLength(24);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(false);
  });
});

describe("profiles", () => {
  it("picks a valid, unique username, then waits 30 days to change it", async () => {
    for (const bad of ["ab", "Has Space", "admin", "x".repeat(21), "dấu"])
      await expect(updateProfileSettings(db, author, { username: bad })).rejects.toBeTruthy();
    expect(await updateProfileSettings(db, author, { username: "TacGia_1" })).toEqual({
      username: "tacgia_1",
      profilePublic: true,
      nextUsernameChangeAt: null,
    });
    await expect(updateProfileSettings(db, reader, { username: "tacgia_1" })).rejects.toMatchObject(
      {
        code: "USERNAME_TAKEN",
      },
    );
    // The first pick is free; a change starts the cooldown, a second change waits for it.
    const changed = await updateProfileSettings(db, author, { username: "tacgia_2" });
    expect(changed.nextUsernameChangeAt).not.toBeNull();
    await expect(updateProfileSettings(db, author, { username: "tacgia_3" })).rejects.toMatchObject(
      {
        code: "USERNAME_COOLDOWN",
      },
    );
    expect((await getProfileSettings(db, author)).username).toBe("tacgia_2");
  });
  it("shows a public profile with its listed sets only", async () => {
    await updateProfileSettings(db, author, { username: "tacgia" });
    await makeSet("Listed one", { visibility: "public" });
    await makeSet("Unlisted one", { visibility: "unlisted" });
    const profile = await getPublicProfile(db, "tacgia", null);
    expect(profile.sets.items.map((item) => item.title)).toEqual(["Listed one"]);
    expect(profile.totals).toMatchObject({ sets: 1, cards: 10 });
    expect(profile.sets.items[0].author.username).toBe("tacgia");
  });
  it("hides a private profile from everyone but its owner, and banned people entirely", async () => {
    await updateProfileSettings(db, author, { username: "tacgia", profilePublic: false });
    await expect(getPublicProfile(db, "tacgia", null)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicProfile(db, "tacgia", reader)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicProfile(db, "tacgia", author)).resolves.toMatchObject({ isSelf: true });
    // Explore no longer links to a hidden profile.
    await makeSet("Anonymous", { visibility: "public" });
    expect(
      (await searchSets(db, exploreQuerySchema.parse({})))!.items[0].author.username,
    ).toBeNull();
    await updateProfileSettings(db, author, { profilePublic: true });
    await db.update(schema.user).set({ bannedAt: new Date() }).where(eq(schema.user.id, author));
    await expect(getPublicProfile(db, "tacgia", null)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicProfile(db, "../etc", null)).rejects.toMatchObject({ status: 404 });
  });
});
