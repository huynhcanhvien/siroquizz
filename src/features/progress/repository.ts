import { createId, nowIso } from "@/lib/id";
import { RepositoryError } from "@/lib/repository-error";
import type { AppStorage } from "@/lib/storage";
import type { CardProgress, CardStatus, GameKind, GameScore, StudyActivity, TestResult } from "@/lib/types";
import {
  cardProgressSchema,
  gameScoreInputSchema,
  gameScoreSchema,
  studyActivitySchema,
  testResultInputSchema,
  testResultSchema,
  type GameScoreInput,
  type TestResultInput,
} from "./schemas";

export interface ProgressRepository {
  getSetProgress(setId: string): Promise<CardProgress[]>;
  saveCardStatus(setId: string, cardId: string, status: CardStatus): Promise<CardProgress>;
  resetSetProgress(setId: string): Promise<void>;
  getTestResults(setId: string): Promise<TestResult[]>;
  saveTestResult(input: TestResultInput): Promise<TestResult>;
  updateTestResultScore(id: string, score: number): Promise<TestResult>;
  getGameScores(setId: string, game?: GameKind): Promise<GameScore[]>;
  saveGameScore(input: GameScoreInput): Promise<GameScore>;
  recordActivity(setId: string): Promise<void>;
  getRecentActivity(limit: number): Promise<StudyActivity[]>;
}

export const PROGRESS_COLLECTIONS = {
  progress: "progress",
  testResults: "testResults",
  gameScores: "gameScores",
  activity: "activity",
} as const;

const MAX_ACTIVITY_PER_USER = 50;

interface LocalProgressDeps {
  storage: AppStorage;
  getUserId: () => Promise<string | null>;
}

export function createLocalProgressRepository({ storage, getUserId }: LocalProgressDeps): ProgressRepository {
  const requireUser = async (): Promise<string> => {
    const userId = await getUserId();
    if (!userId) throw new RepositoryError("UNAUTHENTICATED");
    return userId;
  };

  const readProgress = () => storage.readCollection(PROGRESS_COLLECTIONS.progress, cardProgressSchema);
  const readResults = () => storage.readCollection(PROGRESS_COLLECTIONS.testResults, testResultSchema);
  const readScores = () => storage.readCollection(PROGRESS_COLLECTIONS.gameScores, gameScoreSchema);
  const readActivity = () => storage.readCollection(PROGRESS_COLLECTIONS.activity, studyActivitySchema);

  return {
    async getSetProgress(setId) {
      const userId = await requireUser();
      return readProgress().filter((item) => item.userId === userId && item.setId === setId);
    },

    async saveCardStatus(setId, cardId, status) {
      const userId = await requireUser();
      const entry: CardProgress = { userId, setId, cardId, status, updatedAt: nowIso() };
      const others = readProgress().filter((item) => !(item.userId === userId && item.cardId === cardId));
      storage.writeCollection(PROGRESS_COLLECTIONS.progress, [...others, entry]);
      return entry;
    },

    async resetSetProgress(setId) {
      const userId = await requireUser();
      const remaining = readProgress().filter((item) => !(item.userId === userId && item.setId === setId));
      storage.writeCollection(PROGRESS_COLLECTIONS.progress, remaining);
    },

    async getTestResults(setId) {
      const userId = await requireUser();
      return readResults()
        .filter((item) => item.userId === userId && item.setId === setId)
        .toSorted((a, b) => b.takenAt.localeCompare(a.takenAt));
    },

    async saveTestResult(input) {
      const userId = await requireUser();
      const parsed = testResultInputSchema.safeParse(input);
      if (!parsed.success || parsed.data.score > parsed.data.total) throw new RepositoryError("VALIDATION");
      const result: TestResult = { ...parsed.data, id: createId(), userId, takenAt: nowIso() };
      storage.writeCollection(PROGRESS_COLLECTIONS.testResults, [...readResults(), result]);
      return result;
    },

    async updateTestResultScore(id, score) {
      const userId = await requireUser();
      const results = readResults();
      const existing = results.find((item) => item.id === id && item.userId === userId);
      if (!existing) throw new RepositoryError("NOT_FOUND");
      if (!Number.isInteger(score) || score < 0 || score > existing.total) throw new RepositoryError("VALIDATION");
      const updated: TestResult = { ...existing, score };
      storage.writeCollection(
        PROGRESS_COLLECTIONS.testResults,
        results.map((item) => (item.id === id ? updated : item)),
      );
      return updated;
    },

    async getGameScores(setId, game) {
      const userId = await requireUser();
      return readScores()
        .filter((item) => item.userId === userId && item.setId === setId && (!game || item.game === game))
        .toSorted((a, b) => b.playedAt.localeCompare(a.playedAt));
    },

    async saveGameScore(input) {
      const userId = await requireUser();
      const parsed = gameScoreInputSchema.safeParse(input);
      if (!parsed.success) throw new RepositoryError("VALIDATION");
      const score: GameScore = { ...parsed.data, id: createId(), userId, playedAt: nowIso() };
      storage.writeCollection(PROGRESS_COLLECTIONS.gameScores, [...readScores(), score]);
      return score;
    },

    async recordActivity(setId) {
      const userId = await requireUser();
      const all = readActivity();
      const mine = all.filter((item) => item.userId === userId && item.setId !== setId);
      const others = all.filter((item) => item.userId !== userId);
      const next = [{ userId, setId, at: nowIso() }, ...mine].slice(0, MAX_ACTIVITY_PER_USER);
      storage.writeCollection(PROGRESS_COLLECTIONS.activity, [...others, ...next]);
    },

    async getRecentActivity(limit) {
      const userId = await requireUser();
      return readActivity()
        .filter((item) => item.userId === userId)
        .toSorted((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
    },
  };
}

/** Removes every progress record that belongs to a deleted set (local cascade). */
export function purgeSetRecords(storage: AppStorage, setId: string): void {
  const purge = <T extends { setId: string }>(name: string, items: T[]) =>
    storage.writeCollection(
      name,
      items.filter((item) => item.setId !== setId),
    );
  purge(PROGRESS_COLLECTIONS.progress, storage.readCollection(PROGRESS_COLLECTIONS.progress, cardProgressSchema));
  purge(PROGRESS_COLLECTIONS.testResults, storage.readCollection(PROGRESS_COLLECTIONS.testResults, testResultSchema));
  purge(PROGRESS_COLLECTIONS.gameScores, storage.readCollection(PROGRESS_COLLECTIONS.gameScores, gameScoreSchema));
  purge(PROGRESS_COLLECTIONS.activity, storage.readCollection(PROGRESS_COLLECTIONS.activity, studyActivitySchema));
}
