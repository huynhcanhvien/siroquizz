import Quill from "quill";
import { SAFE_AUTHOR_ID } from "../lib/author-colors";

const Parchment = Quill.import("parchment");

/**
 * Marks who wrote each run of text as a `ql-author-<userId>` class. It travels through Y.Text
 * like any other inline format, and author-colors.ts turns it into a colour per role.
 */
class AuthorAttributor extends Parchment.ClassAttributor {
  override canAdd(node: HTMLElement, value: unknown): boolean {
    return typeof value === "string" && SAFE_AUTHOR_ID.test(value) && super.canAdd(node, value);
  }
}

let registered = false;
/** Registers the author format once, before the first editor is created. */
export function registerAuthorFormat(): void {
  if (registered) return;
  Quill.register(
    new AuthorAttributor("author", "ql-author", { scope: Parchment.Scope.INLINE }),
    true,
  );
  registered = true;
}

export const EDITOR_FORMATS = [
  "bold",
  "italic",
  "underline",
  "color",
  "background",
  "author",
  "list",
] as const;
