"use client";

import dynamic from "next/dynamic";
import { notFound, useParams } from "next/navigation";
import type { ComponentType } from "react";
import { Skeleton } from "@/components/ui/misc";
import { NotEnoughCards } from "@/features/games/components/GameChrome";
import { GAME_META, eligibleCardCount } from "@/features/games/components/game-meta";
import { StudyPage } from "@/features/study/components/StudyPage";
import { GAME_KINDS, type GameKind, type StudySet } from "@/lib/types";

const loading = () => <Skeleton className="mx-auto mt-8 h-96 w-full max-w-4xl rounded-3xl" />;
// Each game ships in its own chunk: opening Match no longer downloads Gravity, Memory, Scramble.
const GAMES: Record<GameKind, ComponentType<{ set: StudySet }>> = {
  dictation: dynamic(
    () => import("@/features/games/components/VocabularyGame").then((m) => m.DictationGame),
    { loading },
  ),
  quiz: dynamic(
    () => import("@/features/games/components/VocabularyGame").then((m) => m.QuizGame),
    { loading },
  ),
  match: dynamic(() => import("@/features/games/components/MatchGame").then((m) => m.MatchGame), {
    loading,
  }),
  gravity: dynamic(
    () => import("@/features/games/components/GravityGame").then((m) => m.GravityGame),
    { loading },
  ),
  memory: dynamic(
    () => import("@/features/games/components/MemoryGame").then((m) => m.MemoryGame),
    { loading },
  ),
  scramble: dynamic(
    () => import("@/features/games/components/ScrambleGame").then((m) => m.ScrambleGame),
    { loading },
  ),
};

function isGameKind(value: string): value is GameKind {
  return (GAME_KINDS as readonly string[]).includes(value);
}

export default function GamePage() {
  const { game } = useParams<{ game: string }>();
  if (!isGameKind(game)) notFound();
  const Game = GAMES[game];

  return (
    <StudyPage mode="games">
      {(set) =>
        eligibleCardCount(set, game) < (game === "quiz" ? 1 : GAME_META[game].minCards) ? (
          <NotEnoughCards setId={set.id} minCards={GAME_META[game].minCards} />
        ) : (
          <Game set={set} />
        )
      }
    </StudyPage>
  );
}
