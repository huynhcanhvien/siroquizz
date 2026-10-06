import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { creditStatus } from "@/server/ai/credits";
import { adminApi } from "@/server/admin-api";
import { communityApi } from "@/server/community-api";
import { stopJob } from "@/server/ai/jobs";
import { setBanned } from "@/server/services/reports";
import { setRole } from "@/server/services/admin/users";
import { initialState } from "@/server/ai/job-steps";
import { ADMIN_PAGE_SIZE } from "@/server/services/admin/schemas";

vi.mock("@/server/env", () => ({ getServerEnv: () => ({ AI_GLOBAL_DAILY_TOKENS: 350_000 }) }));
vi.mock("@/server/rate-limit", () => ({ enforceLimit: vi.fn() }));

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://siroquizz:siroquizz_local_only@localhost:5433/siroquizz_test";
if (!new URL(url).pathname.endsWith("_test")) throw new Error("Test DB required");
const connection = postgres(url, { max: 3 }),
  db = drizzle(connection, { schema }) as Database,
  admin = v7(),
  member = v7();

const call = (
  actor: string,
  path: string,
  init: { method?: string; body?: object; query?: string } = {},
) =>
  adminApi(
    db,
    actor,
    new Request(`http://test/api/v1/${path}${init.query ? `?${init.query}` : ""}`, {
      method: init.method ?? "GET",
      ...(init.body
        ? { body: JSON.stringify(init.body), headers: { "content-type": "application/json" } }
        : {}),
    }),
    path.split("/"),
  );
const data = async <T>(promise: ReturnType<typeof call>) => (await promise)?.data as T;
const auditActions = async () =>
  (await db.select({ action: schema.auditLogs.action }).from(schema.auditLogs)).map(
    (row) => row.action,
  );
const insertJob = (userId: string, status = "queued") =>
  db
    .insert(schema.aiJobs)
    .values({ id: v7(), userId, status, prompt: "Kitchen words", options: {}, uploadIds: [] })
    .returning({ id: schema.aiJobs.id });

beforeAll(() => migrate(db, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await db.execute(sql`truncate "user" cascade`);
  await db.insert(schema.user).values([
    { id: admin, name: "Admin", email: "a-admin@example.com", role: "admin" },
    { id: member, name: "Member Mai", email: "a-member@example.com", username: "maimai" },
  ]);
});
afterAll(() => connection.end());

describe("admin access", () => {
  const endpoints = [
    { path: "admin/overview" },
    { path: "admin/users" },
    { path: `admin/users/${member}` },
    { path: "admin/jobs" },
    { path: "admin/sets" },
    { path: "admin/audit" },
    { path: "admin/reports" },
    { path: "admin/moderation" },
    { path: `admin/sets/${v7()}/history` },
    ...["ban", "unban", "credits"].map((action) => ({
      path: `admin/users/${member}/${action}`,
      method: "POST",
      body: { delta: 5, note: "x" },
    })),
    { path: `admin/users/${member}/role`, method: "PATCH", body: { role: "admin" } },
    { path: `admin/jobs/${v7()}/cancel`, method: "POST" },
    { path: `admin/reports/${v7()}/resolve`, method: "POST", body: { action: "dismiss" } },
    ...["approve", "reject", "hide", "restore"].map((action) => ({
      path: `admin/sets/${v7()}/${action}`,
      method: "POST",
      body: {},
    })),
  ];
  it.each(["member", "banned", "deleted"])(
    "refuses %s on every read and write route",
    async (state) => {
      const actor = state === "member" ? member : admin;
      if (state !== "member")
        await db
          .update(schema.user)
          .set(state === "banned" ? { bannedAt: new Date() } : { deletedAt: new Date() })
          .where(eq(schema.user.id, actor));
      for (const { path, ...init } of endpoints)
        await expect(call(actor, path, init)).rejects.toMatchObject({ status: 403 });
    },
  );

  it("is reached through the community router and 404s unknown admin paths", async () => {
    const request = new Request("http://test/api/v1/admin/overview");
    await expect(communityApi(db, admin, request, ["admin", "overview"])).resolves.toMatchObject({
      data: { users: { total: 2, admins: 1 } },
    });
    await expect(call(admin, "admin/nothing")).rejects.toMatchObject({ status: 404 });
    expect(await communityApi(db, admin, request, ["sets"])).toBeNull();
  });
});

describe("users", () => {
  it("searches by email, name or username and pages by cursor", async () => {
    type Page = { items: { id: string; email: string }[]; nextCursor: string | null };
    const byName = await data<Page>(call(admin, "admin/users", { query: "q=mai" }));
    expect(byName.items.map((u) => u.email)).toEqual(["a-member@example.com"]);
    expect((await data<Page>(call(admin, "admin/users", { query: "q=%25" }))).items).toHaveLength(
      0,
    );

    await db.insert(schema.user).values(
      Array.from({ length: ADMIN_PAGE_SIZE }, (_, i) => ({
        id: v7(),
        name: `Bulk ${i}`,
        email: `bulk-${i}@example.com`,
      })),
    );
    const first = await data<Page>(call(admin, "admin/users"));
    expect(first.items).toHaveLength(ADMIN_PAGE_SIZE);
    const second = await data<Page>(
      call(admin, "admin/users", { query: `cursor=${first.nextCursor}` }),
    );
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items].map((u) => u.id);
    expect(new Set(all).size).toBe(ADMIN_PAGE_SIZE + 2);
  });

  it("returns a detail view without secrets and 404s a missing user", async () => {
    const detail = await data<Record<string, unknown>>(call(admin, `admin/users/${member}`));
    expect(detail).toMatchObject({ user: { email: "a-member@example.com" }, openReports: 0 });
    expect(JSON.stringify(detail)).not.toMatch(/password|token/i);
    await expect(call(admin, `admin/users/${v7()}`)).rejects.toMatchObject({ status: 404 });
  });

  it("grants and revokes admin, but never on oneself or a locked account", async () => {
    const role = (actor: string, target: string, value: string) =>
      call(actor, `admin/users/${target}/role`, { method: "PATCH", body: { role: value } });
    await role(admin, member, "admin");
    await expect(call(member, "admin/overview")).resolves.toBeTruthy();
    await role(admin, member, "user");
    await expect(call(member, "admin/overview")).rejects.toMatchObject({ status: 403 });
    await expect(role(admin, admin, "user")).rejects.toMatchObject({ status: 400 });

    await call(admin, `admin/users/${member}/ban`, { method: "POST" });
    await expect(role(admin, member, "admin")).rejects.toMatchObject({ status: 400 });
    expect(await auditActions()).toEqual(
      expect.arrayContaining(["user_grant_admin", "user_revoke_admin", "user_ban"]),
    );
  });
});

describe("concurrent role changes", () => {
  it("keeps an active admin when two admins ban each other concurrently", async () => {
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, member));
    const results = await Promise.allSettled([
      setBanned(db, admin, member, true),
      setBanned(db, member, admin, true),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const admins = await db.select().from(schema.user).where(eq(schema.user.role, "admin"));
    expect(admins.filter((account) => !account.bannedAt)).toHaveLength(1);
    expect(await auditActions()).toEqual(["user_ban"]);
  });

  it("keeps an admin when two admins revoke each other concurrently", async () => {
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, member));
    const results = await Promise.allSettled([
      setRole(db, admin, member, { role: "user" }),
      setRole(db, member, admin, { role: "user" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const admins = await db.select().from(schema.user).where(eq(schema.user.role, "admin"));
    expect(admins).toHaveLength(1);
    expect(await auditActions()).toEqual(["user_revoke_admin"]);
  });
});

describe("credits", () => {
  const adjust = (target: string, delta: number) =>
    call(admin, `admin/users/${target}/credits`, {
      method: "POST",
      body: { delta, note: "Support ticket" },
    });

  it("adds and removes earned credits, with one audit row each", async () => {
    await adjust(member, 40);
    expect((await creditStatus(db, member)).earned).toBe(40);
    await adjust(member, -15);
    expect((await creditStatus(db, member)).earned).toBe(25);
    expect(await auditActions()).toEqual(["credit_adjust", "credit_adjust"]);
  });

  it("references the audit ID and corrects a negative clawback baseline", async () => {
    await db
      .insert(schema.creditLedger)
      .values({ id: v7(), userId: member, delta: -5, reason: "clawback", ref: v7() });
    await adjust(member, 3);
    expect((await creditStatus(db, member)).earned).toBe(3);
    const [entry] = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.reason, "admin_adjust"));
    const [audit] = await db.select().from(schema.auditLogs);
    expect(entry.ref).toBe(audit.id);
    expect(audit.meta).toMatchObject({ delta: 3, baselineCorrection: 5 });
    expect(await auditActions()).toEqual(["credit_adjust"]);
  });

  it("refuses to go below zero, to adjust oneself, or a bad amount", async () => {
    await expect(adjust(member, -1)).rejects.toMatchObject({ status: 400 });
    await expect(adjust(admin, 10)).rejects.toMatchObject({ status: 400 });
    await expect(adjust(member, 5000)).rejects.toThrow();
    await expect(adjust(v7(), 5)).rejects.toMatchObject({ status: 404 });
    expect(await auditActions()).toEqual([]);
  });
});

describe("AI jobs", () => {
  it("lists jobs across users, filtered by running status", async () => {
    await insertJob(member, "generating");
    await insertJob(member, "done");
    type Page = { items: { status: string; userEmail: string }[] };
    const active = await data<Page>(call(admin, "admin/jobs", { query: "status=active" }));
    expect(active.items).toEqual([
      expect.objectContaining({ status: "generating", userEmail: "a-member@example.com" }),
    ]);
    expect((await data<Page>(call(admin, "admin/jobs"))).items).toHaveLength(2);
  });

  it("rolls back cancellation and credit charging when its audit fails", async () => {
    const [job] = await insertJob(member, "generating");
    await db
      .update(schema.aiJobs)
      .set({
        creditsReserved: 8,
        state: {
          ...initialState(),
          rawCards: Array.from({ length: 16 }, () => ({
            term: "a",
            definition: "b",
            phonetic: "",
          })),
        },
      })
      .where(eq(schema.aiJobs.id, job.id));
    await expect(
      stopJob(db, member, job.id, async () => {
        throw new Error("Audit failed");
      }),
    ).rejects.toThrow("Audit failed");
    const [row] = await db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, job.id));
    expect(row).toMatchObject({ status: "generating", creditsReserved: 8, creditsCharged: 0 });
    await call(admin, `admin/jobs/${job.id}/cancel`, { method: "POST" });
    const [cancelled] = await db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, job.id));
    expect(cancelled).toMatchObject({ status: "cancelled", creditsReserved: 0, creditsCharged: 4 });
    expect((await creditStatus(db, member)).reserved).toBe(0);
    expect(await auditActions()).toEqual(["job_cancel"]);
  });

  it("cancels an open job once and audits it", async () => {
    const [job] = await insertJob(member, "generating");
    await call(admin, `admin/jobs/${job.id}/cancel`, { method: "POST" });
    const [row] = await db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, job.id));
    expect(row).toMatchObject({ status: "cancelled", creditsReserved: 0, creditsCharged: 0 });
    await expect(
      call(admin, `admin/jobs/${job.id}/cancel`, { method: "POST" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await auditActions()).toEqual(["job_cancel"]);
  });
});

describe("sets and audit", () => {
  const insertSet = (visibility: "private" | "public", title: string) =>
    db
      .insert(schema.studySets)
      .values({
        id: v7(),
        ownerId: member,
        title,
        termLang: "en",
        definitionLang: "vi",
        visibility,
        cardCount: 2,
        moderationStatus: visibility === "public" ? "approved" : "none",
      })
      .returning({ id: schema.studySets.id });

  it("lists shared sets only, hides on request and keeps the history", async () => {
    const [shared] = await insertSet("public", "Kitchen words");
    await insertSet("private", "Diary");
    type Page = { items: { id: string; title: string }[] };
    const listed = await data<Page>(call(admin, "admin/sets"));
    expect(listed.items.map((s) => s.title)).toEqual(["Kitchen words"]);

    await call(admin, `admin/sets/${shared.id}/hide`, { method: "POST", body: {} });
    const hidden = await data<Page>(call(admin, "admin/sets", { query: "status=hidden" }));
    expect(hidden.items.map((s) => s.id)).toEqual([shared.id]);
    const history = await data<{ action: string; actorName: string }[]>(
      call(admin, `admin/sets/${shared.id}/history`),
    );
    expect(history).toEqual([expect.objectContaining({ action: "set_hide", actorName: "Admin" })]);
  });

  it("filters the audit log by action and actor", async () => {
    await call(admin, `admin/users/${member}/ban`, { method: "POST" });
    await call(admin, `admin/users/${member}/unban`, { method: "POST" });
    type Page = { items: { action: string; actorName: string }[] };
    const bans = await data<Page>(call(admin, "admin/audit", { query: "action=user_ban" }));
    expect(bans.items).toEqual([
      expect.objectContaining({ action: "user_ban", actorName: "Admin" }),
    ]);
    const byActor = await data<Page>(call(admin, "admin/audit", { query: `actorId=${admin}` }));
    expect(byActor.items.map((row) => row.action)).toEqual(["user_unban", "user_ban"]);
  });
});
