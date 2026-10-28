import type { CardOp, ChangeOps } from "../collab/schemas";

/** A card as the editor holds it: no id for new rows, optional fields may be blank. */
export interface DraftCard {
  id?: string;
  term: string;
  definition: string;
  phonetic?: string;
  example?: string;
}
type OpCard = Extract<CardOp, { op: "add" }>["card"];

const optional = (value: string | undefined) => value?.trim() || undefined;
/** Trimmed content with blank optional fields dropped, so "" and undefined compare equal. */
function contentOf(card: DraftCard): OpCard {
  const phonetic = optional(card.phonetic),
    example = optional(card.example);
  return {
    term: card.term.trim(),
    definition: card.definition.trim(),
    ...(phonetic ? { phonetic } : {}),
    ...(example ? { example } : {}),
  };
}
const sameContent = (a: OpCard, b: OpCard) =>
  a.term === b.term &&
  a.definition === b.definition &&
  a.phonetic === b.phonetic &&
  a.example === b.example;

/**
 * The card ops turning `before` into `after`, matched by id: unchanged cards produce nothing,
 * changed ones an edit, missing ones a delete; cards without a known id (or a repeated one) are
 * additions. Order is ignored: reordering cannot be proposed.
 */
export function diffCards(before: readonly DraftCard[], after: readonly DraftCard[]): CardOp[] {
  const beforeById = new Map(before.flatMap((card) => (card.id ? [[card.id, card] as const] : [])));
  const seen = new Set<string>();
  const changes = after.flatMap((card): CardOp[] => {
    const original = card.id && !seen.has(card.id) ? beforeById.get(card.id) : undefined;
    if (!original || !card.id) return [{ op: "add", card: contentOf(card) }];
    seen.add(card.id);
    const content = contentOf(card);
    return sameContent(content, contentOf(original))
      ? []
      : [{ op: "edit", cardId: card.id, card: content }];
  });
  const deletions = [...beforeById.keys()]
    .filter((id) => !seen.has(id))
    .map((cardId): CardOp => ({ op: "delete", cardId }));
  return [...changes, ...deletions];
}

/** A whole proposal: title and description only when they changed, plus the card ops. */
export function diffSet(
  before: { title: string; description: string; cards: readonly DraftCard[] },
  after: { title: string; description: string; cards: readonly DraftCard[] },
): ChangeOps {
  const title = after.title.trim(),
    description = after.description.trim();
  return {
    ...(title !== before.title.trim() ? { title } : {}),
    ...(description !== before.description.trim() ? { description } : {}),
    cards: diffCards(before.cards, after.cards),
  };
}

/**
 * Applies ops to a deck without mutating it. Edits and deletions of cards that no longer exist
 * are skipped (the set moved on since the proposal); additions go to the end with `newId()`.
 */
export function applyOps<T extends { id: string }>(
  cards: readonly T[],
  ops: readonly CardOp[],
  newId: () => string,
): (T | (OpCard & { id: string }))[] {
  const edits = new Map(
    ops.flatMap((op) => (op.op === "edit" ? [[op.cardId, op.card] as const] : [])),
  );
  const deleted = new Set(ops.flatMap((op) => (op.op === "delete" ? [op.cardId] : [])));
  const kept = cards
    .filter((card) => !deleted.has(card.id))
    .map((card) => {
      const edit = edits.get(card.id);
      return edit ? { id: card.id, ...edit } : card;
    });
  const added = ops.flatMap((op) => (op.op === "add" ? [{ id: newId(), ...op.card }] : []));
  return [...kept, ...added];
}
