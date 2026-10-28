import { foldForSearch } from "@/lib/normalize";
import type { CardProgress, CardStatus, SetSource, StudySet } from "@/lib/types";

export type LibrarySort = "recent" | "title" | "cards";
export type LibrarySourceFilter = SetSource | "all";

export interface LibraryFilter {
  query: string;
  source: LibrarySourceFilter;
  sort: LibrarySort;
}

const SORTERS: Record<LibrarySort, (a: StudySet, b: StudySet) => number> = {
  recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  title: (a, b) => a.title.localeCompare(b.title),
  cards: (a, b) => b.cardCount - a.cardCount,
};

export function filterAndSortSets(sets: readonly StudySet[], filter: LibraryFilter): StudySet[] {
  const query = foldForSearch(filter.query);
  return sets
    .filter((set) => filter.source === "all" || set.source === filter.source)
    .filter((set) => !query || foldForSearch(`${set.title} ${set.description}`).includes(query))
    .toSorted(SORTERS[filter.sort]);
}

/** Swaps term and definition. Phonetics described the old term, so they are cleared. */
export function swapSides<T extends { term: string; definition: string; phonetic?: string }>(rows: readonly T[]): T[] {
  return rows.map((row) => ({ ...row, term: row.definition, definition: row.term, phonetic: "" }));
}

export function isBlankCardRow(row: { term: string; definition: string; phonetic?: string }): boolean {
  return !row.term.trim() && !row.definition.trim() && !(row.phonetic ?? "").trim();
}

export function moveItem<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export type ProgressSummary = Record<CardStatus, number> & { total: number };
export interface ProgressCounts {
  known: number;
  learning: number;
}

/** Counts known/learning rows, ignoring progress left on cards outside `cardIds` when given. */
export function countProgress(progress: readonly CardProgress[], cardIds?: ReadonlySet<string>): ProgressCounts {
  return progress.reduce<ProgressCounts>(
    (counts, item) =>
      item.status === "new" || (cardIds && !cardIds.has(item.cardId))
        ? counts
        : { ...counts, [item.status]: counts[item.status] + 1 },
    { known: 0, learning: 0 },
  );
}

/** Every card without a known/learning status is new; listings send counts, not cards. */
export function summarizeProgress(cardCount: number, counts: ProgressCounts): ProgressSummary {
  return { ...counts, new: Math.max(0, cardCount - counts.known - counts.learning), total: cardCount };
}
