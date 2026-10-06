import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import { MAX_EVENTS, replayGravity, replayMatch } from "@/features/games/lib/replay";
import type { Card } from "@/lib/types";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { cards, classMembers, classSets, gameSessions, user } from "../db/schema";
import { requireStudySet } from "./access";

/** A ranked game must be finished within this long of starting. */
const MAX_SESSION_MS = 2 * 3600_000;
const LEADERBOARD_SIZE = 20;
export const RANKED_GAMES = ["match", "gravity"] as const;
type RankedGame = (typeof RANKED_GAMES)[number];

async function setCards(db: Database, setId: string): Promise<Card[]> {
  return db
    .select({ id: cards.id, term: cards.term, definition: cards.definition })
    .from(cards)
    .where(eq(cards.setId, setId))
    .orderBy(asc(cards.position));
}

const startSchema = z.object({
  game: z.enum(RANKED_GAMES),
  answerSide: z.enum(["term", "definition"]).default("term"),
});
/**
 * Starts a ranked game on a set the player may study. The client builds its board from the
 * returned seed and card order, exactly as the server will when it checks the result.
 */
export async function startGameSession(
  db: Database,
  userId: string,
  setId: string,
  input: unknown,
) {
  const data = startSchema.parse(input);
  await requireStudySet(db, userId, setId);
  const order = await setCards(db, setId);
  if (order.length < 2) throw new ApiError(400, "VALIDATION_ERROR");
  const id = v7();
  const seed = randomInt(1, 2 ** 31 - 1);
  await db.insert(gameSessions).values({ id, userId, setId, seed, ...data });
  return { id, seed, cardIds: order.map((card) => card.id) };
}

const eventSchema = z.union([
  z.object({ t: z.number().min(0), tileId: z.string().max(200) }),
  z.object({ t: z.number().min(0), text: z.string().max(1000) }),
  z.object({ t: z.number().min(0), missed: z.literal(true) }),
]);
const finishSchema = z.object({ events: z.array(eventSchema).max(MAX_EVENTS) });
/**
 * Replays a finished ranked game and records the outcome. A session is checked once; anything
 * implausible is kept out of the leaderboard with the reason stored.
 */
export async function finishGameSession(
  db: Database,
  userId: string,
  sessionId: string,
  input: unknown,
) {
  const { events } = finishSchema.parse(input);
  const [session] = await db
    .select()
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.id, z.uuid().parse(sessionId)),
        eq(gameSessions.userId, userId),
        isNull(gameSessions.finishedAt),
      ),
    )
    .limit(1);
  if (!session) throw new ApiError(404, "NOT_FOUND");
  const now = new Date();
  const elapsedMs = now.getTime() - session.startedAt.getTime();
  const deck = await setCards(db, session.setId);
  const result =
    elapsedMs > MAX_SESSION_MS
      ? ({ verified: false, reason: "clock" } as const)
      : session.game === "match"
        ? replayMatch(deck, session.seed, events, elapsedMs)
        : replayGravity(
            deck,
            session.answerSide === "definition" ? "definition" : "term",
            session.seed,
            events,
            elapsedMs,
          );
  const updated = await db
    .update(gameSessions)
    .set({
      finishedAt: now,
      verified: result.verified,
      score: result.verified ? result.score : null,
      timeMs: result.verified ? result.timeMs : null,
      rejectedReason: result.verified ? null : result.reason,
    })
    .where(and(eq(gameSessions.id, session.id), isNull(gameSessions.finishedAt)))
    .returning({ id: gameSessions.id });
  // A concurrent finish already recorded this session.
  if (!updated.length) throw new ApiError(409, "CONFLICT");
  return result;
}

const boardSchema = z.object({
  game: z.enum(RANKED_GAMES),
  classId: z.uuid().optional(),
});
export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatarColor: string;
  score: number;
  timeMs: number;
  isMe: boolean;
}
/**
 * Best verified result per person on a set: fastest Match, highest Gravity score. With a class,
 * only that class's members are ranked, and only if the set is assigned there.
 */
export async function leaderboard(
  db: Database,
  userId: string,
  setId: string,
  query: URLSearchParams,
) {
  const { game, classId } = boardSchema.parse(Object.fromEntries(query));
  await requireStudySet(db, userId, setId);
  if (classId) {
    const [allowed] = await db
      .select({ classId: classSets.classId })
      .from(classSets)
      .innerJoin(classMembers, eq(classMembers.classId, classSets.classId))
      .where(
        and(
          eq(classSets.classId, classId),
          eq(classSets.setId, setId),
          eq(classMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!allowed) throw new ApiError(404, "NOT_FOUND");
  }
  const better = (g: RankedGame) =>
    g === "match"
      ? [asc(gameSessions.timeMs), asc(gameSessions.finishedAt)]
      : [desc(gameSessions.score), asc(gameSessions.finishedAt)];
  // Each person's best verified session, then the best of those.
  const best = db
    .selectDistinctOn([gameSessions.userId], {
      userId: gameSessions.userId,
      score: gameSessions.score,
      timeMs: gameSessions.timeMs,
      finishedAt: gameSessions.finishedAt,
    })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.setId, setId),
        eq(gameSessions.game, game),
        eq(gameSessions.verified, true),
        classId
          ? sql`exists(select 1 from class_members m where m.class_id = ${classId} and m.user_id = ${gameSessions.userId})`
          : undefined,
      ),
    )
    .orderBy(gameSessions.userId, ...better(game))
    .as("best");
  const rows = await db
    .select({
      userId: best.userId,
      score: best.score,
      timeMs: best.timeMs,
      name: user.name,
      avatarColor: user.avatarColor,
    })
    .from(best)
    .innerJoin(user, eq(user.id, best.userId))
    .where(and(isNull(user.bannedAt), isNull(user.deletedAt)))
    .orderBy(
      ...(game === "match"
        ? [asc(best.timeMs), asc(best.finishedAt)]
        : [desc(best.score), asc(best.finishedAt)]),
    )
    .limit(200);
  const entries: LeaderboardEntry[] = rows.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    avatarColor: row.avatarColor,
    score: row.score ?? 0,
    timeMs: row.timeMs ?? 0,
    isMe: row.userId === userId,
  }));
  return {
    game,
    entries: entries.slice(0, LEADERBOARD_SIZE),
    me: entries.find((entry) => entry.isMe) ?? null,
  };
}
