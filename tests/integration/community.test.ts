import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { ApiError } from "@/server/api-error";
import { canEditSet, canViewSet, isListed, type SetRow } from "@/server/services/access";
import {
  createSetInTransaction,
  duplicateSet,
  getSet,
  removeSet,
  updateSet,
} from "@/server/services/sets";
import {
  copyPublicSet,
  getPublicSet,
  newSlug,
  retryModeration,
  setVisibility,
} from "@/server/services/sharing";
import {
  applySetAction,
  moderatePending,
  moderationQueue,
  moderationSample,
  scanForContactDetails,
} from "@/server/services/moderation";
import { createReport, listOpenReports, resolveReport, setBanned } from "@/server/services/reports";
import { creditStatus } from "@/server/ai/credits";
import { communityApi } from "@/server/community-api";

const verdict = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/groq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/groq")>()),
  groqJson: verdict,
}));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ AI_GLOBAL_DAILY_CREDITS: 480 }) }));
vi.mock("@/server/rate-limit", () => ({ enforceLimit: vi.fn() }));

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  owner = v7(),
  other = v7(),
  admin = v7();
const safe = { data: { violation: false, category: "safe", reason: "ok" }, usage: {}, model: "m" };
const unsafe = {
  data: { violation: true, category: "hate", reason: "Targets a group" },
  usage: {},
  model: "m",
};
const tenCards = Array.from({ length: 10 }, (_, i) => ({
  term: `word ${i}`,
  definition: `từ ${i}`,
}));
const createSet = (ownerId = owner, cards = tenCards, title = "Kitchen words") =>
  db.transaction((tx) =>
    createSetInTransaction(tx, ownerId, {
      title,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards,
    }),
  );
const row = async (id: string) =>
  (await db.select().from(schema.studySets).where(eq(schema.studySets.id, id)))[0];
const earned = async (userId: string) => (await creditStatus(db, userId)).earned;
const share = async (id: string, visibility: "private" | "unlisted" | "public") =>
  setVisibility(db, owner, id, { visibility });

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    {
      id: owner,
      name: "Owner",
      email: "c-owner@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    {
      id: other,
      name: "Other",
      email: "c-other@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
    },
    {
      id: admin,
      name: "Mod",
      email: "c-admin@example.com",
      emailVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400_000),
      role: "admin",
    },
  ]);
  verdict.mockReset().mockResolvedValue(safe);
});
afterAll(() => connection.end());

describe("access rules", () => {
  const base = {
    id: v7(),
    ownerId: owner,
    visibility: "private",
    moderationStatus: "none",
    hiddenAt: null,
    deletedAt: null,
  } as unknown as SetRow;
  const set = (changes: Partial<SetRow>) => ({ ...base, ...changes }) as SetRow;

  it("private: only the owner can view, not even a moderator", () => {
    expect(canViewSet(owner, base)).toBe(true);
    expect(canViewSet(other, base)).toBe(false);
    expect(canViewSet(null, base)).toBe(false);
    expect(canViewSet(admin, base, { viewerIsAdmin: true })).toBe(false);
    // Moderators do see shared sets that were taken down, to review them.
    const hidden = set({ visibility: "unlisted", hiddenAt: new Date() });
    expect(canViewSet(admin, hidden, { viewerIsAdmin: true })).toBe(true);
  });
  it("unlisted and public: anyone with the link, including guests", () => {
    for (const visibility of ["unlisted", "public"] as const) {
      const shared = set({ visibility, moderationStatus: "approved" });
      expect(canViewSet(null, shared)).toBe(true);
      expect(canViewSet(other, shared)).toBe(true);
    }
  });
  it("a public set stops being reachable once moderation flags or rejects it", () => {
    for (const status of ["flagged", "rejected"] as const) {
      const flagged = set({ visibility: "public", moderationStatus: status });
      expect(canViewSet(null, flagged)).toBe(false);
      expect(canViewSet(owner, flagged)).toBe(true);
    }
    expect(canViewSet(null, set({ visibility: "public", moderationStatus: "pending" }))).toBe(true);
  });
  it("hidden, banned-owner and deleted sets disappear for everyone but the owner", () => {
    const hidden = set({ visibility: "unlisted", hiddenAt: new Date() });
    expect(canViewSet(other, hidden)).toBe(false);
    expect(canViewSet(owner, hidden)).toBe(true);
    expect(canViewSet(other, set({ visibility: "unlisted" }), { ownerBanned: true })).toBe(false);
    expect(canViewSet(owner, set({ deletedAt: new Date() }))).toBe(false);
  });
  it("only the owner edits", () => {
    const shared = set({ visibility: "public", moderationStatus: "approved" });
    expect(canEditSet(owner, shared)).toBe(true);
    expect(canEditSet(other, shared)).toBe(false);
    expect(canEditSet(null, shared)).toBe(false);
  });
  it("only approved public sets are listed", () => {
    expect(isListed(set({ visibility: "public", moderationStatus: "approved" }))).toBe(true);
    expect(isListed(set({ visibility: "public", moderationStatus: "pending" }))).toBe(false);
    expect(isListed(set({ visibility: "unlisted", moderationStatus: "approved" }))).toBe(false);
  });
});

describe("sharing", () => {
  it("gives a set an unguessable link that guests can open while it is shared", async () => {
    const created = await createSet();
    expect((await getSet(db, owner, created.id)).sharing).toMatchObject({
      visibility: "private",
      slug: null,
    });
    const shared = await share(created.id, "unlisted");
    expect(shared.slug).toMatch(/^[A-Za-z0-9]{10}$/);
    const guest = await getPublicSet(db, null, shared.slug!);
    expect(guest).toMatchObject({ title: "Kitchen words", isOwner: false, listed: false });
    expect(guest.cards).toHaveLength(10);
    expect(guest).not.toHaveProperty("ownerId");
    expect(guest.author).toEqual({ name: "Owner", avatarColor: "indigo", username: null });
    // Back to private: the same link now 404s, and keeps working again when re-shared.
    await share(created.id, "private");
    await expect(getPublicSet(db, null, shared.slug!)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicSet(db, owner, shared.slug!)).resolves.toMatchObject({ isOwner: true });
    expect((await share(created.id, "unlisted")).slug).toBe(shared.slug);
  });
  it("rejects malformed and unknown links without touching the database rows", async () => {
    await expect(getPublicSet(db, null, "../../etc")).rejects.toMatchObject({ status: 404 });
    await expect(getPublicSet(db, null, newSlug())).rejects.toMatchObject({ status: 404 });
  });
  it("lets only the owner change visibility", async () => {
    const created = await createSet();
    await expect(
      setVisibility(db, other, created.id, { visibility: "public" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("moderation and credits", () => {
  it("approves a clean public set, lists it and rewards the author once", async () => {
    const created = await createSet();
    expect(await share(created.id, "public")).toMatchObject({ moderationStatus: "approved" });
    expect(await earned(owner)).toBe(5);
    const slug = (await row(created.id)).slug!;
    expect((await getPublicSet(db, null, slug)).listed).toBe(true);
    // Unpublishing and publishing again does not pay twice or re-check unchanged content.
    await share(created.id, "private");
    await share(created.id, "public");
    expect(await earned(owner)).toBe(5);
    expect(verdict).toHaveBeenCalledTimes(1);
  });
  it("queues a suspicious set for a moderator instead of showing it", async () => {
    verdict.mockResolvedValue(unsafe);
    const created = await createSet();
    expect(await share(created.id, "public")).toMatchObject({
      moderationStatus: "flagged",
      moderationReason: "hate: Targets a group",
    });
    expect(await earned(owner)).toBe(0);
    await expect(getPublicSet(db, null, (await row(created.id)).slug!)).rejects.toMatchObject({
      status: 404,
    });
    expect((await moderationQueue(db)).map((s) => s.id)).toContain(created.id);
  });
  it("flags links and phone numbers without asking the model", async () => {
    expect(scanForContactDetails("visit https://win.example.com")).toMatch(/link/);
    expect(scanForContactDetails("gọi 0912 345 678")).toMatch(/phone/);
    expect(scanForContactDetails("mail me at a@b.co")).toMatch(/email/);
    expect(scanForContactDetails("ninety-nine - 99, year 2026")).toBeNull();
    const created = await createSet(owner, [
      ...tenCards,
      { term: "deal", definition: "www.scam.vn" },
    ]);
    expect(await share(created.id, "public")).toMatchObject({ moderationStatus: "flagged" });
    expect(verdict).not.toHaveBeenCalled();
  });
  it("keeps a set pending when the model is busy and checks it later", async () => {
    verdict.mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED"));
    const created = await createSet();
    expect(await share(created.id, "public")).toMatchObject({ moderationStatus: "pending" });
    expect((await getPublicSet(db, null, (await row(created.id)).slug!)).listed).toBe(false);
    expect(await moderatePending(db)).toEqual(["approved"]);
    expect(await earned(owner)).toBe(5);
    expect(await retryModeration(db, owner, created.id)).toMatchObject({
      moderationStatus: "approved",
    });
  });
  it("checks a public set again after it is edited", async () => {
    const created = await createSet();
    await share(created.id, "public");
    verdict.mockResolvedValue(unsafe);
    const edited = await updateSet(db, owner, created.id, {
      title: "Changed",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: tenCards,
    });
    expect(edited.sharing?.moderationStatus).toBe("flagged");
  });
  it("samples a bounded part of a large set for the model", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      term: `term number ${i}`,
      definition: `một định nghĩa khá dài cho thuật ngữ số ${i}`,
    }));
    const sample = moderationSample({ title: "Big", description: "" }, many);
    expect(sample.length).toBeLessThan(4000);
    expect(sample).toContain("term number 0");
    expect(sample).toContain("term number 4");
  });
  it("lets a moderator approve, reject, hide and restore, logging each action", async () => {
    verdict.mockResolvedValue(unsafe);
    const created = await createSet();
    await share(created.id, "public");
    await applySetAction(db, admin, created.id, "approve");
    expect(await earned(owner)).toBe(5);
    await applySetAction(db, admin, created.id, "hide");
    expect(await earned(owner)).toBe(0);
    const slug = (await row(created.id)).slug!;
    await expect(getPublicSet(db, null, slug)).rejects.toMatchObject({ status: 404 });
    await applySetAction(db, admin, created.id, "restore");
    await expect(getPublicSet(db, null, slug)).resolves.toBeTruthy();
    const log = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.targetId, created.id));
    expect(log.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["auto_flag", "set_approve", "set_hide", "set_restore"]),
    );
  });
});

describe("copying", () => {
  it("copies a shared set into the viewer's library, credits the author once", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "public");
    const copy = await copyPublicSet(db, other, slug!);
    const mine = await getSet(db, other, copy.id);
    expect(mine.cards).toHaveLength(10);
    expect(mine.sharing?.visibility).toBe("private");
    expect(mine.copiedFrom).toEqual({ title: "Kitchen words", slug, authorName: "Owner" });
    expect(await earned(owner)).toBe(5 + 1);
    await copyPublicSet(db, other, slug!);
    expect(await earned(owner)).toBe(6);
    // Copies of copies earn their maker nothing.
    const { slug: copySlug } = await setVisibility(db, other, copy.id, { visibility: "public" });
    expect(await earned(other)).toBe(0);
    expect(copySlug).toBeTruthy();
  });
  it("does not reward copies of unlisted sets or of one's own set", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "unlisted");
    await copyPublicSet(db, other, slug!);
    await copyPublicSet(db, owner, slug!);
    expect(await earned(owner)).toBe(0);
  });
  it("cannot copy what the viewer cannot see", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "unlisted");
    await share(created.id, "private");
    await expect(copyPublicSet(db, other, slug!)).rejects.toMatchObject({ status: 404 });
  });
});

describe("reports and bans", () => {
  it("files one report per person and target, then a moderator hides the set", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "public");
    const report = { targetType: "set", targetId: created.id, reason: "spam", note: "ads" };
    await createReport(db, other, report);
    await createReport(db, other, report);
    const open = await listOpenReports(db);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ setTitle: "Kitchen words", setSlug: slug, userName: "Owner" });
    await resolveReport(db, admin, open[0].id, { action: "hide" });
    await expect(getPublicSet(db, null, slug!)).rejects.toMatchObject({ status: 404 });
    expect(await listOpenReports(db)).toEqual([]);
    expect(await earned(owner)).toBe(0);
  });
  it("cannot report what one cannot see, or oneself", async () => {
    const created = await createSet();
    const report = { targetType: "set", targetId: created.id, reason: "spam" };
    await expect(createReport(db, other, report)).rejects.toMatchObject({ status: 404 });
    await expect(
      createReport(db, owner, { targetType: "user", targetId: owner, reason: "other" }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("a ban signs the author out and takes their shared sets offline", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "unlisted");
    await db.insert(schema.session).values({
      id: v7(),
      token: v7(),
      userId: owner,
      expiresAt: new Date(Date.now() + 86400_000),
    });
    await setBanned(db, admin, owner, true);
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, owner))).toEqual(
      [],
    );
    await expect(getPublicSet(db, null, slug!)).rejects.toMatchObject({ status: 404 });
    await setBanned(db, admin, owner, false);
    await expect(getPublicSet(db, null, slug!)).resolves.toBeTruthy();
    await expect(setBanned(db, admin, admin, true)).rejects.toMatchObject({ status: 400 });
  });
  it("admin endpoints refuse everyone but moderators", async () => {
    const request = new Request("http://test/api/v1/admin/reports");
    await expect(communityApi(db, other, request, ["admin", "reports"])).rejects.toMatchObject({
      status: 403,
    });
    // The session cookie is not trusted: the role is read from the database.
    await db.update(schema.user).set({ role: "user" }).where(eq(schema.user.id, admin));
    await expect(communityApi(db, admin, request, ["admin", "reports"])).rejects.toMatchObject({
      status: 403,
    });
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, admin));
    await expect(communityApi(db, admin, request, ["admin", "reports"])).resolves.toEqual({
      data: [],
    });
  });
});

describe("security review fixes", () => {
  it("re-checks a set whose content changed while it was not public", async () => {
    const created = await createSet();
    await share(created.id, "public");
    expect(await earned(owner)).toBe(5);
    await share(created.id, "private");
    verdict.mockResolvedValue(unsafe);
    await updateSet(db, owner, created.id, {
      title: "Now abusive",
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: tenCards,
    });
    expect((await row(created.id)).moderationStatus).toBe("none");
    expect(await share(created.id, "public")).toMatchObject({ moderationStatus: "flagged" });
  });
  it("closes every shared link of a flagged set, unlisted included", async () => {
    verdict.mockResolvedValue(unsafe);
    const created = await createSet();
    const { slug } = await share(created.id, "public");
    await share(created.id, "unlisted");
    await expect(getPublicSet(db, null, slug!)).rejects.toMatchObject({ status: 404 });
    await expect(getPublicSet(db, owner, slug!)).resolves.toMatchObject({ isOwner: true });
  });
  it("takes back the publish reward when the set is deleted", async () => {
    const created = await createSet();
    await share(created.id, "public");
    expect(await earned(owner)).toBe(5);
    await removeSet(db, owner, created.id);
    expect(await earned(owner)).toBe(0);
  });
  it("pays no publish reward to day-old accounts or past three a day", async () => {
    await db.update(schema.user).set({ createdAt: new Date() }).where(eq(schema.user.id, owner));
    await share((await createSet()).id, "public");
    expect(await earned(owner)).toBe(0);
    await db
      .update(schema.user)
      .set({ createdAt: new Date(Date.now() - 3 * 86400_000) })
      .where(eq(schema.user.id, owner));
    for (let i = 0; i < 4; i++)
      await share((await createSet(owner, tenCards, `S${i}`)).id, "public");
    expect(await earned(owner)).toBe(3 * 5);
  });
  it("keeps attribution when duplicating someone else's set, so republishing earns nothing", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "unlisted");
    const copy = await duplicateSet(db, other, created.id, "Mine now");
    expect((await row(copy.id)).copiedFromId).toBe(created.id);
    await setVisibility(db, other, copy.id, { visibility: "public" });
    expect(await earned(other)).toBe(0);
    expect(slug).toBeTruthy();
  });
  it("takes a deleted account's shared sets offline", async () => {
    const created = await createSet();
    const { slug } = await share(created.id, "unlisted");
    await db.update(schema.user).set({ deletedAt: new Date() }).where(eq(schema.user.id, owner));
    await expect(getPublicSet(db, null, slug!)).rejects.toMatchObject({ status: 404 });
  });
});
