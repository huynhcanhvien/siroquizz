"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Medal, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { createHttpClient } from "@/lib/http-client";
import type { Card, Side, StudySet } from "@/lib/types";
import { formatDuration } from "./lib/best-score";
import type { GameEvent } from "./lib/replay";

const client = createHttpClient();
const isHttp = process.env.NEXT_PUBLIC_DATA_SOURCE === "http";
export type RankedGame = "match" | "gravity";

export interface RankedSession {
  id: string;
  seed: number;
  /** The set's cards in the server's order, which the seeded board is built from. */
  cards: Card[];
}
const sessionSchema = z.object({
  id: z.uuid(),
  seed: z.number().int(),
  cardIds: z.array(z.string()),
});
const resultSchema = z.union([
  z.object({ verified: z.literal(true), score: z.number(), timeMs: z.number() }),
  z.object({
    verified: z.literal(false),
    reason: z.enum(["invalid_event", "unfinished", "too_fast", "clock"]),
  }),
]);
type RankedResult = z.infer<typeof resultSchema>;
const boardSchema = z.object({
  entries: z.array(
    z.object({
      rank: z.number(),
      name: z.string(),
      avatarColor: z.string(),
      score: z.number(),
      timeMs: z.number(),
      isMe: z.boolean(),
    }),
  ),
  me: z.object({ rank: z.number() }).nullable(),
});
const boardKey = (setId: string, game: RankedGame) => ["leaderboard", setId, game] as const;

/**
 * Asks the server for a ranked game. Returns null to play unranked: offline mode, a failed
 * request, or a filtered deck (e.g. starred cards only) that differs from the full set.
 */
export async function startRankedSession(
  set: StudySet,
  game: RankedGame,
  answerSide: Side = "term",
): Promise<RankedSession | null> {
  if (!isHttp) return null;
  try {
    const { data } = await client.request(`/api/v1/sets/${set.id}/game-sessions`, sessionSchema, {
      method: "POST",
      body: { game, answerSide },
    });
    const byId = new Map(set.cards.map((card) => [card.id, card]));
    const cards = data.cardIds.map((id) => byId.get(id));
    if (cards.length !== set.cards.length || cards.some((card) => !card)) return null;
    return { id: data.id, seed: data.seed, cards: cards as Card[] };
  } catch {
    return null;
  }
}

/** Sends a finished ranked game for the server to replay. */
export function useFinishRanked(setId: string, game: RankedGame) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, events }: { sessionId: string; events: GameEvent[] }) =>
      (
        await client.request(`/api/v1/game-sessions/${sessionId}/finish`, resultSchema, {
          method: "POST",
          body: { events },
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKey(setId, game) }),
  });
}

function Leaderboard({ setId, game }: { setId: string; game: RankedGame }) {
  const t = useTranslations("games.ranked");
  const board = useQuery({
    queryKey: boardKey(setId, game),
    queryFn: async () =>
      (await client.request(`/api/v1/sets/${setId}/leaderboard?game=${game}`, boardSchema)).data,
  });
  if (!board.data) return null;
  return (
    <section aria-labelledby="leaderboard-title" className="w-full text-left">
      <h2 id="leaderboard-title" className="mb-2 flex items-center gap-2 font-bold">
        <Medal className="size-4 text-accent-text" aria-hidden />
        {t("leaderboard")}
      </h2>
      {board.data.entries.length ? (
        <ol className="flex flex-col gap-1">
          {board.data.entries.map((entry) => (
            <li
              key={entry.rank}
              className={cn(
                "grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                entry.isMe ? "bg-primary-soft font-bold text-primary-text" : "bg-surface-2",
              )}
            >
              <span className="tabular-nums">#{entry.rank}</span>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={entry.name} color={entry.avatarColor} size="sm" />
                <span className="truncate">
                  {entry.isMe ? `${entry.name} (${t("you")})` : entry.name}
                </span>
              </span>
              <span className="tabular-nums">
                {game === "match" ? formatDuration(entry.timeMs) : entry.score}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">{t("empty")}</p>
      )}
      {board.data.me && board.data.me.rank > board.data.entries.length ? (
        <p className="mt-2 text-sm font-semibold">{t("yourRank", { rank: board.data.me.rank })}</p>
      ) : null}
    </section>
  );
}

/**
 * On the result screen: submits a ranked game once, says whether it counted, and shows the
 * set's leaderboard.
 */
export function RankedSummary({
  setId,
  game,
  sessionId,
  events,
}: {
  setId: string;
  game: RankedGame;
  sessionId: string | null;
  events: GameEvent[];
}) {
  const t = useTranslations("games.ranked");
  const finish = useFinishRanked(setId, game);
  const { mutate } = finish;
  // A session can be finished once; this also survives effects running twice in development.
  const submitted = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || submitted.current === sessionId) return;
    submitted.current = sessionId;
    mutate({ sessionId, events });
  }, [sessionId, events, mutate]);
  if (!isHttp) return null;
  const result: RankedResult | undefined = finish.data;
  return (
    <div className="flex w-full flex-col gap-4">
      <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold">
        {!sessionId ? (
          t("unranked")
        ) : !result ? (
          t("checking")
        ) : result.verified ? (
          <>
            <ShieldCheck className="size-4 text-success" aria-hidden />
            {t("verified")}
          </>
        ) : (
          <>
            <ShieldOff className="size-4 text-danger" aria-hidden />
            {t("rejected", { reason: t(`reasons.${result.reason}`) })}
          </>
        )}
      </p>
      {sessionId && !result ? null : <Leaderboard setId={setId} game={game} />}
    </div>
  );
}
