/** How a non-GET request counts against the per-user write limit. */
export type WritePolicy = { key: string; max: number; seconds: number } | "none";

const STANDARD: WritePolicy = { key: "write", max: 60, seconds: 60 };
/** Study flows write on every swipe or grade; a fast learner must not hit the generic cap. */
const FAST: WritePolicy = { key: "write-fast", max: 120, seconds: 60 };

/**
 * Picks the write bucket from the API path (segments after `/api/v1/`). AI routes carry their
 * own, purpose-sized limits (uploads, steps, auxiliary quota), so the shared bucket skips them.
 */
export function writePolicy(path: readonly string[]): WritePolicy {
  const [domain, , sub] = path;
  if (domain === "ai") return "none";
  if (domain === "reviews") return FAST;
  if (domain === "sets" && sub === "progress" && path.length === 3) return FAST;
  if (domain === "writing" && path[1] === "docs" && path[3] === "sync" && path.length === 4)
    return FAST;
  return STANDARD;
}
