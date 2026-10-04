import { BrainCircuit, CloudRain, Puzzle, Shuffle, type LucideIcon } from "lucide-react";
import type { GameKind } from "@/lib/types";

export interface GameMeta {
  icon: LucideIcon;
  minCards: number;
  tone: string;
}

export const GAME_META: Record<GameKind, GameMeta> = {
  match: { icon: Puzzle, minCards: 2, tone: "bg-accent-soft text-accent-strong" },
  gravity: { icon: CloudRain, minCards: 1, tone: "bg-primary-soft text-primary" },
  memory: { icon: BrainCircuit, minCards: 2, tone: "bg-success-soft text-success" },
  scramble: { icon: Shuffle, minCards: 1, tone: "bg-danger-soft text-danger" },
};
