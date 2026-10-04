import "server-only";
import { and, eq, gte, gt, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { dayKey, dayStart, shiftDay, computeStreak } from "@/features/stats/lib/days";
import type { Database } from "../db/client";
import {
  cardProgress,
  reviewLogs,
  studySessions,
  studySets,
  testResults,
  streakFreezes,
} from "../db/schema";
import { getPreferences } from "./learning";
export async function activityStats(db: Database, userId: string, from: string, to: string) {
  z.iso.date().parse(from);
  z.iso.date().parse(to);
  if (from > to || (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 366)
    throw new z.ZodError([]);
  const prefs = await getPreferences(db, userId),
    start = dayStart(from, prefs.timeZone),
    end = dayStart(shiftDay(to, 1), prefs.timeZone);
  const reviewDay = sql<string>`to_char(timezone(${prefs.timeZone},${reviewLogs.reviewedAt}),'YYYY-MM-DD')`;
  const reviews = await db
    .select({
      day: reviewDay,
      count: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter(where ${reviewLogs.rating}>=2)::int`,
    })
    .from(reviewLogs)
    .innerJoin(studySets, eq(studySets.id, reviewLogs.setId))
    .where(
      and(
        eq(reviewLogs.userId, userId),
        isNull(studySets.deletedAt),
        gte(reviewLogs.reviewedAt, start),
        lte(reviewLogs.reviewedAt, new Date(end.getTime() - 1)),
      ),
    )
    .groupBy(reviewDay);
  const sessionDay = sql<string>`to_char(timezone(${prefs.timeZone},${studySessions.startedAt}),'YYYY-MM-DD')`;
  const sessions = await db
    .select({
      day: sessionDay,
      cards: sql<number>`coalesce(sum(${studySessions.cardsSeen}),0)::int`,
      correct: sql<number>`coalesce(sum(${studySessions.correct}),0)::int`,
      minutes: sql<number>`coalesce(sum(least(43200,extract(epoch from (${studySessions.endedAt}-${studySessions.startedAt}))))/60,0)::float8`,
    })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        gte(studySessions.startedAt, start),
        lte(studySessions.startedAt, new Date(end.getTime() - 1)),
      ),
    )
    .groupBy(sessionDay);
  const reviewByDay = new Map(reviews.map((row) => [row.day, row])),
    sessionByDay = new Map(sessions.map((row) => [row.day, row]));
  const days = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    const review = reviewByDay.get(day),
      session = sessionByDay.get(day);
    const cards = Math.max(review?.count ?? 0, session?.cards ?? 0),
      correct = review?.count ? review.correct : (session?.correct ?? 0),
      minutes = Math.round((session?.minutes ?? 0) * 10) / 10;
    days.push({
      day,
      cards,
      correct,
      minutes,
      goalMet: (prefs.goalType === "cards" ? cards : minutes) >= prefs.goal,
    });
  }
  return days;
}
export async function statsOverview(db: Database, userId: string, now = new Date()) {
  const prefs = await getPreferences(db, userId),
    today = dayKey(now, prefs.timeZone);
  const activity = await activityStats(db, userId, shiftDay(today, -364), today);
  const freezes = await db.select().from(streakFreezes).where(eq(streakFreezes.userId, userId));
  const streak = computeStreak(
    activity.filter((d) => d.goalMet).map((d) => d.day),
    today,
    freezes.map((f) => f.day),
  );
  const [known] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardProgress)
    .innerJoin(studySets, eq(studySets.id, cardProgress.setId))
    .where(
      and(
        eq(cardProgress.userId, userId),
        eq(cardProgress.status, "known"),
        isNull(studySets.deletedAt),
      ),
    );
  const tests = await db
    .select({
      setId: studySets.id,
      title: studySets.title,
      score: sql<number>`sum(${testResults.score})::int`,
      total: sql<number>`sum(${testResults.total})::int`,
    })
    .from(testResults)
    .innerJoin(studySets, eq(studySets.id, testResults.setId))
    .where(and(eq(testResults.userId, userId), isNull(studySets.deletedAt)))
    .groupBy(studySets.id, studySets.title)
    .limit(1000);
  const dueDay = sql<string>`to_char(timezone(${prefs.timeZone},${cardProgress.due}),'YYYY-MM-DD')`;
  const dueRows = await db
    .select({ day: dueDay, count: sql<number>`count(*)::int` })
    .from(cardProgress)
    .innerJoin(studySets, eq(studySets.id, cardProgress.setId))
    .where(
      and(
        eq(cardProgress.userId, userId),
        gt(cardProgress.reps, 0),
        isNull(studySets.deletedAt),
        gte(cardProgress.due, dayStart(today, prefs.timeZone)),
        lte(cardProgress.due, dayStart(shiftDay(today, 7), prefs.timeZone)),
      ),
    )
    .groupBy(dueDay);
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i);
    return { day, count: dueRows.find((r) => r.day === day)?.count ?? 0 };
  });
  // First known review per card, aggregated by day, gives an "ever learned" timeline without double counting reviews.
  const learnedRows = await db.execute(
    sql`select to_char(timezone(${prefs.timeZone}, first_review),'YYYY-MM-DD') as day, count(*)::int as count from (select min(reviewed_at) as first_review from review_logs r inner join study_sets s on s.id=r.set_id where r.user_id=${userId} and r.rating>=3 and s.deleted_at is null group by r.card_id) t group by day order by day`,
  );
  let learned = learnedRows
    .filter((row) => String(row.day) < activity[0].day)
    .reduce((n, row) => n + Number(row.count), 0);
  const learnedHistory = activity.map((item) => {
    for (const row of learnedRows) if (row.day === item.day) learned += Number(row.count);
    return { day: item.day, count: learned };
  });
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const end = shiftDay(today, -i * 7),
      start = shiftDay(end, -6);
    return {
      day: start,
      minutes:
        Math.round(
          activity
            .filter((d) => d.day >= start && d.day <= end)
            .reduce((n, d) => n + d.minutes, 0) * 10,
        ) / 10,
    };
  }).reverse();
  return {
    preferences: prefs,
    today: activity.at(-1)!,
    streak,
    knownCards: known.count,
    activity,
    forecast,
    accuracy: tests.map((t) => ({ ...t, accuracy: t.total ? t.score / t.total : 0 })),
    weekly,
    learnedHistory,
  };
}
