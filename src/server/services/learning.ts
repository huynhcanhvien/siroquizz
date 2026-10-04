import "server-only";
import { and, asc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import type { Card as FsrsCard } from "ts-fsrs";
import { preferencesSchema, preferenceDefaults, reviewInputSchema } from "@/features/srs/schemas";
import { scheduleReview } from "@/features/srs/lib/scheduler";
import { dayKey, dayStart, shiftDay } from "@/features/stats/lib/days";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import {
  cards,
  cardProgress,
  cardStars,
  cardImages,
  reviewLogs,
  studySessions,
  studySets,
  user,
  userPreferences,
  streakFreezes,
} from "../db/schema";
import { requireOwnedSet, type Transaction, type Db } from "./sets";

export async function getPreferences(db: Db, userId: string) {
  const read = () => db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  // Read first: the row almost always exists, so the default-row write is a one-time cost.
  const [existing] = await read();
  if (existing) return preferencesSchema.parse(existing);
  await db
    .insert(userPreferences)
    .values({ userId, ...preferenceDefaults })
    .onConflictDoNothing();
  const [row] = await read();
  return preferencesSchema.parse(row);
}
export async function savePreferences(db: Database, userId: string, input: unknown) {
  const data = preferencesSchema.partial().parse(input),
    current = await getPreferences(db, userId);
  const valid = preferencesSchema.parse({ ...current, ...data });
  await db.update(userPreferences).set(valid).where(eq(userPreferences.userId, userId));
  return valid;
}
export async function requireCard(db: Db, userId: string, id: string) {
  z.uuid().parse(id);
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  if (!card) throw new ApiError(404, "NOT_FOUND");
  await requireOwnedSet(db, userId, card.setId);
  return card;
}
export async function newAllowance(db: Db, userId: string, now = new Date()) {
  const prefs = await getPreferences(db, userId),
    day = dayKey(now, prefs.timeZone),
    start = dayStart(day, prefs.timeZone),
    end = dayStart(shiftDay(day, 1), prefs.timeZone);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewLogs)
    .where(
      and(
        eq(reviewLogs.userId, userId),
        eq(reviewLogs.wasNew, true),
        gte(reviewLogs.reviewedAt, start),
        lt(reviewLogs.reviewedAt, end),
      ),
    );
  return { remaining: Math.max(0, prefs.newCardsPerDay - row.count), prefs };
}
function toFsrs(row: typeof cardProgress.$inferSelect): FsrsCard {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.lastReview ?? undefined,
  };
}
export async function lockLearner(tx: Transaction, userId: string) {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
}
/** Caller holds the user lock before any set/card locks, so batches and reviews share lock order. */
export async function reviewInTransaction(
  tx: Transaction,
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = reviewInputSchema.parse(input);
  const [event] = await tx
    .select()
    .from(reviewLogs)
    .where(eq(reviewLogs.id, data.eventId))
    .limit(1);
  if (event) {
    if (event.userId !== userId || event.cardId !== data.cardId)
      throw new ApiError(404, "NOT_FOUND");
    return event.snapshot;
  }
  const card = await requireCard(tx, userId, data.cardId);
  await requireOwnedSet(tx, userId, card.setId, true);
  const [previous] = await tx
    .select()
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, userId), eq(cardProgress.cardId, card.id)))
    .limit(1);
  const wasNew = !previous?.reps;
  const { remaining, prefs } = await newAllowance(tx, userId, now);
  if (wasNew && !remaining) throw new ApiError(429, "NEW_CARD_LIMIT");
  const next = scheduleReview(
    previous ? toFsrs(previous) : null,
    data.rating,
    now,
    prefs.retention,
  );
  const values = {
    userId,
    cardId: card.id,
    setId: card.setId,
    status: data.rating >= 3 ? ("known" as const) : ("learning" as const),
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    lastReview: next.last_review ?? now,
    updatedAt: now,
  };
  const [saved] = await tx
    .insert(cardProgress)
    .values(values)
    .onConflictDoUpdate({ target: [cardProgress.userId, cardProgress.cardId], set: values })
    .returning();
  const snapshot = {
    ...saved,
    due: saved.due.toISOString(),
    lastReview: saved.lastReview?.toISOString() ?? null,
    updatedAt: saved.updatedAt.toISOString(),
  };
  await tx.insert(reviewLogs).values({
    id: data.eventId,
    userId,
    cardId: card.id,
    setId: card.setId,
    rating: data.rating,
    mode: data.mode,
    durationMs: data.durationMs,
    reviewedAt: now,
    wasNew,
    snapshot,
  });
  return snapshot;
}
export async function reviewCard(db: Database, userId: string, input: unknown) {
  return db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    return reviewInTransaction(tx, userId, input);
  });
}
export async function dueCards(
  db: Database,
  userId: string,
  limit = 200,
  now = new Date(),
  starred = false,
) {
  z.number().int().min(1).max(200).parse(limit);
  const starFilter = starred
    ? sql`exists(select 1 from card_stars where card_stars.user_id=${userId} and card_stars.card_id=${cards.id})`
    : undefined;
  const base = and(eq(studySets.ownerId, userId), isNull(studySets.deletedAt));
  const [{ remaining }, [count]] = await Promise.all([
    newAllowance(db, userId, now),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(cardProgress)
      .innerJoin(studySets, eq(studySets.id, cardProgress.setId))
      .where(
        and(
          base,
          eq(cardProgress.userId, userId),
          gt(cardProgress.reps, 0),
          lte(cardProgress.due, now),
        ),
      ),
  ]);
  const rows = await db
    .select({
      id: cards.id,
      term: cards.term,
      definition: cards.definition,
      phonetic: cards.phonetic,
      setId: studySets.id,
      setTitle: studySets.title,
      termLang: studySets.termLang,
      definitionLang: studySets.definitionLang,
      due: cardProgress.due,
      reps: cardProgress.reps,
      imageId: cardImages.id,
      imageAlt: cardImages.alt,
    })
    .from(cards)
    .innerJoin(studySets, eq(cards.setId, studySets.id))
    .leftJoin(cardProgress, and(eq(cardProgress.cardId, cards.id), eq(cardProgress.userId, userId)))
    .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
    .where(
      and(
        base,
        starFilter,
        or(isNull(cardProgress.cardId), eq(cardProgress.reps, 0), lte(cardProgress.due, now)),
      ),
    )
    .orderBy(
      sql`case when ${cardProgress.reps}>0 then 0 else 1 end`,
      asc(cardProgress.due),
      asc(cards.id),
    )
    .limit(200 + Math.min(remaining, 100));
  let addedNew = 0;
  const queue = rows
    .filter((row) => {
      if (!row.reps) {
        if (addedNew >= remaining) return false;
        addedNew++;
      }
      return true;
    })
    .slice(0, limit);
  return {
    // Explicit fields only: left-joined columns come back as null, which the client schema
    // (optional, not nullable) rejects — that used to break the whole review page.
    cards: queue.map((row) => ({
      id: row.id,
      term: row.term,
      definition: row.definition,
      ...(row.phonetic ? { phonetic: row.phonetic } : {}),
      setId: row.setId,
      setTitle: row.setTitle,
      termLang: row.termLang,
      definitionLang: row.definitionLang,
      due: (row.due ?? now).toISOString(),
      isNew: !row.reps,
      ...(row.imageId
        ? { imageUrl: `/api/v1/images/${row.imageId}`, imageAlt: row.imageAlt ?? row.definition }
        : {}),
    })),
    totalDue: count.count,
    newRemaining: remaining,
  };
}
export async function getStars(db: Database, userId: string, setId: string) {
  await requireOwnedSet(db, userId, setId);
  return (
    await db
      .select({ cardId: cardStars.cardId })
      .from(cardStars)
      .innerJoin(cards, eq(cards.id, cardStars.cardId))
      .where(and(eq(cardStars.userId, userId), eq(cards.setId, setId)))
  ).map((row) => row.cardId);
}
export async function setStar(db: Database, userId: string, cardId: string, starred: boolean) {
  return db.transaction(async (tx) => {
    await requireCard(tx, userId, cardId);
    if (starred) await tx.insert(cardStars).values({ userId, cardId }).onConflictDoNothing();
    else
      await tx
        .delete(cardStars)
        .where(and(eq(cardStars.userId, userId), eq(cardStars.cardId, cardId)));
  });
}
const sessionInput = z.object({
  setId: z.uuid().nullable().default(null),
  mode: z.enum(["flashcards", "learn", "review", "test", "match", "gravity", "memory", "scramble"]),
});
export async function startSession(db: Database, userId: string, input: unknown) {
  const data = sessionInput.parse(input);
  if (data.setId) await requireOwnedSet(db, userId, data.setId);
  const id = v7();
  await db.insert(studySessions).values({ ...data, id, userId });
  return { id };
}
export async function finishSession(
  db: Database,
  userId: string,
  id: string,
  input: unknown,
  now = new Date(),
) {
  z.uuid().parse(id);
  const data = z
    .object({
      cardsSeen: z.number().int().min(0).max(20000),
      correct: z.number().int().min(0).max(20000),
      incorrect: z.number().int().min(0).max(20000),
    })
    .refine((v) => v.correct + v.incorrect <= v.cardsSeen)
    .parse(input);
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)))
      .for("update")
      .limit(1);
    if (!session) throw new ApiError(404, "NOT_FOUND");
    if (session.endedAt) return { id };
    if (session.setId) await requireOwnedSet(tx, userId, session.setId);
    const endedAt = new Date(Math.min(now.getTime(), session.startedAt.getTime() + 12 * 3600_000));
    await tx
      .update(studySessions)
      .set({ ...data, endedAt })
      .where(eq(studySessions.id, id));
    return { id };
  });
}
export async function freezeStreak(db: Database, userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    const prefs = await getPreferences(tx, userId),
      today = dayKey(now, prefs.timeZone),
      day = shiftDay(today, -1);
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const week = shiftDay(today, -((weekday + 6) % 7));
    const existing = await tx
      .select()
      .from(streakFreezes)
      .where(and(eq(streakFreezes.userId, userId), eq(streakFreezes.week, week)));
    if (existing.length) throw new ApiError(409, "CONFLICT");
    await tx.insert(streakFreezes).values({ userId, day, week });
    return { day };
  });
}
