export const CONTENT_LANGUAGES = ["vi", "en", "zh", "ja", "ko", "fr", "de"] as const;
export type LangCode = (typeof CONTENT_LANGUAGES)[number];

export const SET_SOURCES = ["manual", "ai", "import"] as const;
export type SetSource = (typeof SET_SOURCES)[number];

export const CARD_STATUSES = ["new", "learning", "known"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const GAME_KINDS = ["match", "gravity", "memory", "scramble"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export type Side = "term" | "definition";

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  uiLocale: string;
  createdAt: string;
}

export interface Card {
  id: string;
  term: string;
  definition: string;
  phonetic?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface StudySet {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  termLang: LangCode;
  definitionLang: LangCode;
  cards: Card[];
  source: SetSource;
  createdAt: string;
  updatedAt: string;
}

/** Payload used to create or replace a set. Server-owned fields are excluded. */
export interface SetInput {
  title: string;
  description: string;
  termLang: LangCode;
  definitionLang: LangCode;
  source: SetSource;
  cards: Array<{ id?: string; term: string; definition: string; phonetic?: string }>;
}

export interface CardProgress {
  userId: string;
  setId: string;
  cardId: string;
  status: CardStatus;
  updatedAt: string;
}

export interface TestResult {
  id: string;
  userId: string;
  setId: string;
  score: number;
  total: number;
  durationMs: number;
  takenAt: string;
}

export interface GameScore {
  id: string;
  userId: string;
  setId: string;
  game: GameKind;
  score: number;
  timeMs: number;
  playedAt: string;
}

export interface StudyActivity {
  userId: string;
  setId: string;
  at: string;
}
