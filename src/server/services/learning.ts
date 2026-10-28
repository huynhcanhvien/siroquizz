import "server-only";
import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
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
import { type Transaction, type Db } from "./sets";
import {
  assignedTo,
  ownerInGoodStanding,
  requireStudySet,
  sharedToClassOf,
  type SetLock,
} from "./access";

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
export async function requireCard(db: Db, userId: string, id: string, lock: SetLock = false) {
  z.uuid().parse(id);
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  if (!card) throw new ApiError(404, "NOT_FOUND");
  await requireStudySet(db, userId, card.setId, lock);
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
type ReviewInput = z.infer<typeof reviewInputSchema>;
type ProgressRow = typeof cardProgress.$inferSelect;
export type ReviewSnapshot = ReturnType<typeof toSnapshot>;
export const toSnapshot = (row: ProgressRow) => ({
  ...row,
  due: row.due.toISOString(),
  lastReview: row.lastReview?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});
/** Every progress column but the key is overwritten by a re-review. */
const progressUpsertSet = Object.fromEntries(
  Object.entries(getTableColumns(cardProgress))
    .filter(([key]) => key !== "userId" && key !== "cardId")
    .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)]),
);

/** Events already recorded (retried requests) return their stored snapshot. */
async function replayedEvents(tx: Transaction, userId: string, items: readonly ReviewInput[]) {
  const ids = items.map((item) => item.eventId);
  const events = ids.length
    ? await tx.select().from(reviewLogs).where(inArray(reviewLogs.id, ids))
    : [];
  const byId = new Map(items.map((item) => [item.eventId, item]));
  for (const event of events)
    if (event.userId !== userId || event.cardId !== byId.get(event.id)?.cardId)
      throw new ApiError(404, "NOT_FOUND");
  return new Map(events.map((event) => [event.id, event.snapshot as ReviewSnapshot]));
}
/** Maps each card to its set after checking, in one query, that the learner may study them all. */
async function studyableCards(tx: Transaction, userId: string, items: readonly ReviewInput[]) {
  const ids = items.map((item) => item.cardId);
  const found = ids.length
    ? await tx
        .select({ id: cards.id, setId: cards.setId })
        .from(cards)
        .where(inArray(cards.id, ids))
    : [];
  if (found.length !== ids.length) throw new ApiError(404, "NOT_FOUND");
  // Sorted so concurrent batches touching several sets take their locks in the same order.
  for (const setId of [...new Set(found.map((card) => card.setId))].toSorted())
    await requireStudySet(tx, userId, setId, "share");
  return new Map(found.map((card) => [card.id, card.setId]));
}
function nextProgress(
  userId: string,
  item: ReviewInput,
  setId: string,
  previous: ProgressRow | undefined,
  context: { now: Date; retention: number },
) {
  const { now, retention } = context;
  const next = scheduleReview(previous ? toFsrs(previous) : null, item.rating, now, retention);
  return {
    userId,
    cardId: item.cardId,
    setId,
    status: item.rating >= 3 ? ("known" as const) : ("learning" as const),
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
}
async function progressByCard(tx: Transaction, userId: string, cardIds: string[]) {
  const rows = await tx
    .select()
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, userId), inArray(cardProgress.cardId, cardIds)));
  return new Map(rows.map((row) => [row.cardId, row]));
}
/** Schedules unseen events: one read of prior progress, one upsert, one log insert. */
async function scheduleBatch(
  tx: Transaction,
  userId: string,
  items: readonly ReviewInput[],
  setOf: ReadonlyMap<string, string>,
  now: Date,
) {
  const previousByCard = await progressByCard(
    tx,
    userId,
    items.map((item) => item.cardId),
  );
  const wasNew = (item: ReviewInput) => !previousByCard.get(item.cardId)?.reps;
  const { remaining, prefs } = await newAllowance(tx, userId, now);
  if (items.filter(wasNew).length > remaining) throw new ApiError(429, "NEW_CARD_LIMIT");
  const context = { now, retention: prefs.retention };
  const values = items.map((item) =>
    nextProgress(userId, item, setOf.get(item.cardId)!, previousByCard.get(item.cardId), context),
  );
  const saved = await tx
    .insert(cardProgress)
    .values(values)
    .onConflictDoUpdate({
      target: [cardProgress.userId, cardProgress.cardId],
      set: progressUpsertSet,
    })
    .returning();
  const snapshotByCard = new Map(saved.map((row) => [row.cardId, toSnapshot(row)]));
  await tx.insert(reviewLogs).values(
    items.map((item) => ({
      id: item.eventId,
      userId,
      cardId: item.cardId,
      setId: setOf.get(item.cardId)!,
      rating: item.rating,
      mode: item.mode,
      durationMs: item.durationMs,
      reviewedAt: now,
      wasNew: wasNew(item),
      snapshot: snapshotByCard.get(item.cardId)!,
    })),
  );
  return new Map(items.map((item) => [item.eventId, snapshotByCard.get(item.cardId)!]));
}
/**
 * Records several reviews in a constant number of queries. Caller holds the user lock before any
 * set locks, so batches and single reviews share lock order. `verifiedSetId` skips the card
 * lookup when the caller already checked that every card belongs to that studyable set.
 */
export async function reviewBatchInTransaction(
  tx: Transaction,
  userId: string,
  inputs: readonly unknown[],
  now = new Date(),
  verifiedSetId?: string,
): Promise<ReviewSnapshot[]> {
  const items = z.array(reviewInputSchema).max(500).parse(inputs);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(items.map((item) => item.cardId)) || !unique(items.map((item) => item.eventId)))
    throw new ApiError(400, "VALIDATION_ERROR");
  const replayed = await replayedEvents(tx, userId, items);
  const fresh = items.filter((item) => !replayed.has(item.eventId));
  if (!fresh.length) return items.map((item) => replayed.get(item.eventId)!);
  const setOf = verifiedSetId
    ? new Map(fresh.map((item) => [item.cardId, verifiedSetId]))
    : await studyableCards(tx, userId, fresh);
  const saved = await scheduleBatch(tx, userId, fresh, setOf, now);
  return items.map((item) => replayed.get(item.eventId) ?? saved.get(item.eventId)!);
}
/** One review; see reviewBatchInTransaction for the locking contract. */
export async function reviewInTransaction(
  tx: Transaction,
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const [snapshot] = await reviewBatchInTransaction(tx, userId, [input], now);
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
  folderId?: string,
) {
  z.number().int().min(1).max(200).parse(limit);
  const starFilter = starred
    ? sql`exists(select 1 from card_stars where card_stars.user_id=${userId} and card_stars.card_id=${cards.id})`
    : undefined;
  // A folder narrows the queue to its sets; only the person's own sets are ever included.
  const inFolder = folderId
    ? sql`exists(select 1 from folder_sets where folder_sets.folder_id=${z.uuid().parse(folderId)} and folder_sets.set_id=${studySets.id})`
    : undefined;
  // Assigned class sets are due like one's own.
  const base = and(
    or(
      eq(studySets.ownerId, userId),
      and(
        isNull(studySets.hiddenAt),
        or(assignedTo(userId), sharedToClassOf(userId)),
        ownerInGoodStanding(),
      ),
    ),
    isNull(studySets.deletedAt),
    inFolder,
  );
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
  await requireStudySet(db, userId, setId);
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
  if (data.setId) await requireStudySet(db, userId, data.setId);
  const id = v7();
  await db.insert(studySessions).values({ ...data, id, userId });
  return { id };
}
const MAX_SESSION_MS = 12 * 3600_000;
/**
 * The client reports cumulative counts and engaged time whenever the tab hides or the study
 * screen closes, so a session can be reported several times. Values only ever grow, and engaged
 * time is clamped to the time actually elapsed since the session started.
 */
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
      activeSeconds: z
        .number()
        .int()
        .min(0)
        .max(MAX_SESSION_MS / 1000)
        .optional(),
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
    const startedMs = session.startedAt.getTime();
    if (now.getTime() > startedMs + MAX_SESSION_MS) return { id };
    if (session.setId) await requireStudySet(tx, userId, session.setId);
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedMs) / 1000));
    const reported = Math.min(data.activeSeconds ?? 0, elapsedSeconds);
    await tx
      .update(studySessions)
      .set({
        cardsSeen: Math.max(session.cardsSeen, data.cardsSeen),
        correct: Math.max(session.correct, data.correct),
        incorrect: Math.max(session.incorrect, data.incorrect),
        activeSeconds: Math.max(session.activeSeconds ?? 0, reported),
        endedAt: new Date(Math.max(session.endedAt?.getTime() ?? 0, now.getTime())),
      })
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
