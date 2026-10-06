import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { ApiError } from "../api-error";
import { studySets, user } from "../db/schema";
import { listedFilter, searchSets, exploreQuerySchema } from "./explore";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const USERNAME_COOLDOWN_DAYS = 30;
const RESERVED = new Set([
  "admin",
  "api",
  "explore",
  "settings",
  "login",
  "register",
  "support",
  "siroquizz",
  "root",
  "mod",
  "moderator",
  "help",
]);
const settingsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN)
    .refine((name) => !RESERVED.has(name))
    .optional(),
  profilePublic: z.boolean().optional(),
});

export interface ProfileSettings {
  username: string | null;
  profilePublic: boolean;
  /** When the username may next be changed; null when it can change now. */
  nextUsernameChangeAt: string | null;
}
const settingsOf = (row: {
  username: string | null;
  profilePublic: boolean;
  usernameChangedAt: Date | null;
}): ProfileSettings => {
  const next = row.usernameChangedAt
    ? new Date(row.usernameChangedAt.getTime() + USERNAME_COOLDOWN_DAYS * 86400_000)
    : null;
  return {
    username: row.username,
    profilePublic: row.profilePublic,
    nextUsernameChangeAt: next && next > new Date() ? next.toISOString() : null,
  };
};

export async function getProfileSettings(db: Database, userId: string) {
  const [row] = await db
    .select({
      username: user.username,
      profilePublic: user.profilePublic,
      usernameChangedAt: user.usernameChangedAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  return settingsOf(row);
}

/** Sets the public handle (once every 30 days after the first) and profile visibility. */
export async function updateProfileSettings(db: Database, userId: string, input: unknown) {
  const data = settingsSchema.parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(user).where(eq(user.id, userId)).for("update");
    const changes: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
    if (data.profilePublic !== undefined) changes.profilePublic = data.profilePublic;
    if (data.username !== undefined && data.username !== current.username) {
      if (settingsOf(current).nextUsernameChangeAt) throw new ApiError(429, "USERNAME_COOLDOWN");
      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, data.username));
      if (taken) throw new ApiError(409, "USERNAME_TAKEN");
      changes.username = data.username;
      // Any pick, the first included, starts the 30-day cooldown (spec: once every 30 days).
      changes.usernameChangedAt = new Date();
    }
    const [row] = await tx.update(user).set(changes).where(eq(user.id, userId)).returning();
    return settingsOf(row);
  });
}

/** A person's public page: their listed sets and simple totals. 404 when hidden or banned. */
export async function getPublicProfile(
  db: Database,
  username: string,
  viewerId: string | null,
  page = 1,
) {
  if (!USERNAME_PATTERN.test(username)) throw new ApiError(404, "NOT_FOUND");
  const [person] = await db
    .select()
    .from(user)
    .where(and(eq(user.username, username), isNull(user.bannedAt), isNull(user.deletedAt)))
    .limit(1);
  if (!person || (!person.profilePublic && person.id !== viewerId))
    throw new ApiError(404, "NOT_FOUND");
  const [totals] = await db
    .select({
      sets: sql<number>`count(*)::int`,
      cards: sql<number>`coalesce(sum(${studySets.cardCount}), 0)::int`,
      copies: sql<number>`coalesce(sum((select count(*) from ${studySets} as c where c.copied_from_id = ${studySets.id})), 0)::int`,
    })
    .from(studySets)
    .innerJoin(user, eq(user.id, studySets.ownerId))
    .where(and(eq(studySets.ownerId, person.id), ...listedFilter()));
  const sets = await searchSets(db, exploreQuerySchema.parse({ sort: "new", page }), {
    ownerId: person.id,
  });
  return {
    name: person.name,
    username,
    avatarColor: person.avatarColor,
    memberSince: person.createdAt.toISOString(),
    isSelf: person.id === viewerId,
    profilePublic: person.profilePublic,
    totals,
    sets,
  };
}
