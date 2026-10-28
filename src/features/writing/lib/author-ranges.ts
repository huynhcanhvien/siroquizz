/** The parts of a Quill delta op this needs (quill-delta's Op, without importing Quill). */
export interface DeltaOp {
  insert?: string | Record<string, unknown>;
  retain?: number | Record<string, unknown>;
  delete?: number;
  attributes?: Record<string, unknown>;
}

/**
 * Text the user just inserted that is not yet marked as theirs, as document ranges. Typing inside
 * someone else's coloured run inherits their author; these ranges are re-marked right after.
 * Deleting or formatting other people's text does not change who wrote it.
 */
export function unattributedInserts(
  ops: readonly DeltaOp[],
  userId: string,
): { index: number; length: number }[] {
  const ranges: { index: number; length: number }[] = [];
  let index = 0;
  for (const op of ops) {
    if (typeof op.retain === "number") index += op.retain;
    else if (op.retain) index += 1;
    else if (op.insert !== undefined) {
      const length = typeof op.insert === "string" ? op.insert.length : 1;
      if (typeof op.insert === "string" && op.attributes?.author !== userId)
        ranges.push({ index, length });
      index += length;
    }
  }
  return ranges;
}
