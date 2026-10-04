/** Longest stretch without input still counted as studying (reading a card, thinking). */
export const IDLE_CAP_MS = 60_000;

export interface EngagementTimer {
  /** Record user input at `now`; resumes counting if paused. */
  touch(now: number): void;
  /** Stop counting (tab hidden) until the next `touch`. */
  pause(now: number): void;
  /** Whole seconds of engaged time up to `now`. */
  seconds(now: number): number;
}

/**
 * Measures engaged study time: the gaps between interactions, each capped at IDLE_CAP_MS, and
 * nothing while the tab is hidden. A study screen left open overnight adds a minute, not hours.
 */
export function createEngagementTimer(startedAt: number): EngagementTimer {
  let activeMs = 0;
  let lastAt: number | null = startedAt;
  const gap = (now: number) =>
    lastAt === null ? 0 : Math.min(Math.max(0, now - lastAt), IDLE_CAP_MS);
  return {
    touch(now) {
      activeMs += gap(now);
      lastAt = now;
    },
    pause(now) {
      activeMs += gap(now);
      lastAt = null;
    },
    seconds(now) {
      return Math.floor((activeMs + gap(now)) / 1000);
    },
  };
}
