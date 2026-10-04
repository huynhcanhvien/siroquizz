import type { GameKind, GameScore } from "@/lib/types";

/** Match and Memory rank by fastest time; Gravity and Scramble rank by highest score. */
export function isTimedGame(game: GameKind): boolean {
  return game === "match" || game === "memory";
}

function isBetter(candidate: Pick<GameScore, "score" | "timeMs">, current: Pick<GameScore, "score" | "timeMs">, game: GameKind) {
  return isTimedGame(game) ? candidate.timeMs < current.timeMs : candidate.score > current.score;
}

export function bestScore(scores: readonly GameScore[], game: GameKind): GameScore | null {
  return scores
    .filter((item) => item.game === game)
    .reduce<GameScore | null>((best, item) => (best === null || isBetter(item, best, game) ? item : best), null);
}

export function isNewRecord(
  previousBest: GameScore | null,
  result: Pick<GameScore, "score" | "timeMs">,
  game: GameKind,
): boolean {
  if (!isTimedGame(game) && result.score <= 0) return false;
  return previousBest === null || isBetter(result, previousBest, game);
}

export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${Math.floor(totalSeconds * 10) / 10}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
