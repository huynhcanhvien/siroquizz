import {
  Headphones,
  Timer,
  BrainCircuit,
  CloudRain,
  Puzzle,
  Shuffle,
  type LucideIcon,
} from "lucide-react";
import { uniquePairCards } from "../lib/match";
import { splitUnits } from "../lib/scramble";
import { createQuizQuestions } from "../lib/vocabulary";
import { createRng } from "@/lib/random";
import type { StudySet, GameKind } from "@/lib/types";

export interface GameMeta {
  icon: LucideIcon;
  minCards: number;
  tone: string;
}

export const GAME_META: Record<GameKind, GameMeta> = {
  dictation: { icon: Headphones, minCards: 1, tone: "bg-primary-soft text-primary" },
  quiz: { icon: Timer, minCards: 2, tone: "bg-accent-soft text-accent-strong" },
  match: { icon: Puzzle, minCards: 2, tone: "bg-accent-soft text-accent-strong" },
  gravity: { icon: CloudRain, minCards: 1, tone: "bg-primary-soft text-primary" },
  memory: { icon: BrainCircuit, minCards: 2, tone: "bg-success-soft text-success" },
  scramble: { icon: Shuffle, minCards: 1, tone: "bg-danger-soft text-danger" },
};

export function eligibleCardCount(set: StudySet, game: GameKind): number {
  if (game === "match" || game === "memory") return uniquePairCards(set.cards).length;
  if (game === "scramble")
    return set.cards.filter(
      (card) =>
        new Set(splitUnits(card.term)).size > 1 || new Set(splitUnits(card.definition)).size > 1,
    ).length;
  if (game === "quiz")
    return Math.max(
      createQuizQuestions(set.cards, "definition", createRng(0)).length,
      createQuizQuestions(set.cards, "term", createRng(0)).length,
    );
  return set.cards.length;
}
