import type { ClassRole } from "@/features/classes/schemas";

export type AuthorTone = "author" | "teacher" | "peer" | "unknown";
interface Member {
  userId: string;
  role: ClassRole;
}
/** Ids become CSS class names; anything outside this set is never styled. */
export const SAFE_AUTHOR_ID = /^[A-Za-z0-9_-]+$/;

/**
 * How text written by `writerId` looks in a document by `authorId`: the author's own words are
 * plain, a teacher's are red, a classmate's amber, and someone who left the class is muted.
 */
export function toneFor(
  writerId: string,
  authorId: string,
  members: readonly Member[],
): AuthorTone {
  if (writerId === authorId) return "author";
  const member = members.find((entry) => entry.userId === writerId);
  if (!member) return "unknown";
  return member.role === "student" ? "peer" : "teacher";
}

const TONE_COLOR: Record<AuthorTone, string> = {
  author: "inherit",
  teacher: "var(--danger)",
  peer: "var(--accent-text)",
  unknown: "var(--text-muted)",
};

/**
 * CSS for the `ql-author-<id>` classes Quill puts on each person's text. Colours come from theme
 * tokens, so they follow dark mode; a colour picked in the toolbar is an inline style and wins.
 * Writers no longer in the class fall back to the muted colour.
 */
export function authorStyles(authorId: string, members: readonly Member[]): string {
  const known = members
    .filter((member) => SAFE_AUTHOR_ID.test(member.userId))
    .map(
      (member) =>
        `.ql-editor .ql-author-${member.userId}{color:${TONE_COLOR[toneFor(member.userId, authorId, members)]}}`,
    );
  // Same specificity: the per-person rules come later and win over the fallback.
  // The author keeps plain text even if they are no longer a member.
  const own = SAFE_AUTHOR_ID.test(authorId)
    ? [`.ql-editor .ql-author-${authorId}{color:${TONE_COLOR.author}}`]
    : [];
  return [`.ql-editor [class*="ql-author-"]{color:${TONE_COLOR.unknown}}`, ...known, ...own].join(
    "\n",
  );
}
