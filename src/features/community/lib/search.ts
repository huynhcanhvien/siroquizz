/** Longest indexed text per set; titles, descriptions and tags always fit first. */
const SEARCH_TEXT_MAX = 20_000;
export const MAX_TAGS = 5;
export const TAG_MAX_LENGTH = 24;

/**
 * Folds text for accent-insensitive search: Vietnamese diacritics and đ are removed, case is
 * lowered and whitespace collapsed. Chinese and other scripts pass through unchanged. Stored
 * text and queries go through the same function, so "tu vung" finds "Từ vựng".
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchText(set: {
  title: string;
  description: string;
  tags: readonly string[];
  cards: readonly { term: string; definition: string }[];
}): string {
  const head = [set.title, set.description, ...set.tags].join(" ");
  const body = set.cards.map((card) => `${card.term} ${card.definition}`).join(" ");
  return normalizeSearch(`${head} ${body}`).slice(0, SEARCH_TEXT_MAX);
}

/** Tags as stored: lower-case, trimmed, unique, at most MAX_TAGS of at most TAG_MAX_LENGTH. */
export function normalizeTags(tags: readonly string[]): string[] {
  const cleaned = tags
    .map((tag) => tag.trim().toLowerCase().slice(0, TAG_MAX_LENGTH))
    .filter((tag) => tag.length > 0);
  return [...new Set(cleaned)].slice(0, MAX_TAGS);
}
