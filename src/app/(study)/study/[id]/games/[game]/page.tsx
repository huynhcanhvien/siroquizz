"use client";

import { notFound, useParams } from "next/navigation";
import type { ComponentType } from "react";
import { NotEnoughCards } from "@/features/games/components/GameChrome";
import { GAME_META } from "@/features/games/components/game-meta";
import { GravityGame } from "@/features/games/components/GravityGame";
import { MatchGame } from "@/features/games/components/MatchGame";
import { MemoryGame } from "@/features/games/components/MemoryGame";
import { ScrambleGame } from "@/features/games/components/ScrambleGame";
import { StudyPage } from "@/features/study/components/StudyPage";
import { GAME_KINDS, type GameKind, type StudySet } from "@/lib/types";

const GAMES: Record<GameKind, ComponentType<{ set: StudySet }>> = {
  match: MatchGame,
  gravity: GravityGame,
  memory: MemoryGame,
  scramble: ScrambleGame,
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
        set.cards.length < GAME_META[game].minCards ? (
          <NotEnoughCards setId={set.id} minCards={GAME_META[game].minCards} />
        ) : (
          <Game set={set} />
        )
      }
    </StudyPage>
  );
}
