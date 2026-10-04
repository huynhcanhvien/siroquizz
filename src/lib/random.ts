export type Rng = () => number;

/** Deterministic PRNG (mulberry32) so tests and replays can use a fixed seed. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = Math.random;

export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sample<T>(items: readonly T[], n: number, rng: Rng = defaultRng): T[] {
  return shuffle(items, rng).slice(0, Math.max(0, n));
}

export function pickRandom<T>(items: readonly T[], rng: Rng = defaultRng): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length)];
}
