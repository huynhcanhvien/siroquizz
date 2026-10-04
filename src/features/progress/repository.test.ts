import { beforeEach, describe, expect, it } from "vitest";
import { createStorage, type AppStorage } from "@/lib/storage";
import { createLocalProgressRepository, purgeSetRecords, type ProgressRepository } from "./repository";

describe("local ProgressRepository", () => {
  let storage: AppStorage;
  let userId: string | null;
  let repo: ProgressRepository;

  beforeEach(() => {
    storage = createStorage(window.localStorage);
    userId = "user-1";
    repo = createLocalProgressRepository({ storage, getUserId: async () => userId });
  });

  it("requires a signed-in user", async () => {
    userId = null;
    await expect(repo.getSetProgress("s1")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("upserts card status per user and card", async () => {
    await repo.saveCardStatus("s1", "c1", "learning");
    await repo.saveCardStatus("s1", "c1", "known");
    await repo.saveCardStatus("s1", "c2", "learning");
    const progress = await repo.getSetProgress("s1");
    expect(progress.map((p) => [p.cardId, p.status])).toEqual([
      ["c1", "known"],
      ["c2", "learning"],
    ]);
  });

  it("isolates progress between users", async () => {
    await repo.saveCardStatus("s1", "c1", "known");
    userId = "user-2";
    await expect(repo.getSetProgress("s1")).resolves.toEqual([]);
  });

  it("resets progress for a set", async () => {
    await repo.saveCardStatus("s1", "c1", "known");
    await repo.saveCardStatus("s2", "c9", "known");
    await repo.resetSetProgress("s1");
    await expect(repo.getSetProgress("s1")).resolves.toEqual([]);
    await expect(repo.getSetProgress("s2")).resolves.toHaveLength(1);
  });

  it("saves and lists test results newest first", async () => {
    await repo.saveTestResult({ setId: "s1", score: 3, total: 5, durationMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.saveTestResult({ setId: "s1", score: 5, total: 5, durationMs: 900 });
    const results = await repo.getTestResults("s1");
    expect(results.map((r) => r.score)).toEqual([5, 3]);
  });

  it("updates the score of a saved test result after an override", async () => {
    const saved = await repo.saveTestResult({ setId: "s1", score: 3, total: 5, durationMs: 1000 });
    const updated = await repo.updateTestResultScore(saved.id, 4);
    expect(updated).toMatchObject({ id: saved.id, score: 4, total: 5 });
    await expect(repo.getTestResults("s1")).resolves.toEqual([updated]);
  });

  it("refuses to update another user's result or an invalid score", async () => {
    const saved = await repo.saveTestResult({ setId: "s1", score: 3, total: 5, durationMs: 1000 });
    await expect(repo.updateTestResultScore(saved.id, 6)).rejects.toMatchObject({ code: "VALIDATION" });
    userId = "user-2";
    await expect(repo.updateTestResultScore(saved.id, 4)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a test result with score above total", async () => {
    await expect(repo.saveTestResult({ setId: "s1", score: 6, total: 5, durationMs: 1 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("saves game scores and filters by game", async () => {
    await repo.saveGameScore({ setId: "s1", game: "match", score: 0, timeMs: 15000 });
    await repo.saveGameScore({ setId: "s1", game: "gravity", score: 120, timeMs: 60000 });
    await expect(repo.getGameScores("s1", "match")).resolves.toHaveLength(1);
    await expect(repo.getGameScores("s1")).resolves.toHaveLength(2);
  });

  it("rejects invalid game scores", async () => {
    await expect(
      repo.saveGameScore({ setId: "s1", game: "match", score: -1, timeMs: 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("keeps one activity entry per set, most recent first", async () => {
    await repo.recordActivity("s1");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.recordActivity("s2");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.recordActivity("s1");
    const activity = await repo.getRecentActivity(10);
    expect(activity.map((a) => a.setId)).toEqual(["s1", "s2"]);
  });

  it("purges every record of a deleted set", async () => {
    await repo.saveCardStatus("s1", "c1", "known");
    await repo.saveTestResult({ setId: "s1", score: 1, total: 1, durationMs: 1 });
    await repo.saveGameScore({ setId: "s1", game: "memory", score: 1, timeMs: 1 });
    await repo.recordActivity("s1");
    purgeSetRecords(storage, "s1");
    await expect(repo.getSetProgress("s1")).resolves.toEqual([]);
    await expect(repo.getTestResults("s1")).resolves.toEqual([]);
    await expect(repo.getGameScores("s1")).resolves.toEqual([]);
    await expect(repo.getRecentActivity(5)).resolves.toEqual([]);
  });
});
