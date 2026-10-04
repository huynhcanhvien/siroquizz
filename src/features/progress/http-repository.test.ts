import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "@/lib/http-client";
import { createHttpProgressRepository } from "./http-repository";

const now = "2026-10-04T00:00:00Z";
const progress = { userId: "user", setId: "set", cardId: "card", status: "known", updatedAt: now };
const test = {
  id: "result",
  userId: "user",
  setId: "set",
  score: 1,
  total: 2,
  durationMs: 100,
  takenAt: now,
};
const game = {
  id: "score",
  userId: "user",
  setId: "set",
  game: "match",
  score: 10,
  timeMs: 1000,
  playedAt: now,
};

function fixture(data: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ success: true, data }));
  return { repo: createHttpProgressRepository(createHttpClient(fetcher)), fetcher };
}

describe("HTTP progress repository contract", () => {
  it("reads progress without dropping metadata", async () => {
    const { repo } = fixture([progress]);
    expect(await repo.getSetProgress("set")).toEqual([progress]);
  });
  it("sends one card in the batch API format and returns its server timestamp", async () => {
    const { repo, fetcher } = fixture([progress]);
    expect(await repo.saveCardStatus("set", "card", "known")).toEqual(progress);
    expect(fetcher.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      cards: [{ cardId: "card", status: "known" }],
    });
  });
  it("rejects missing progress acknowledgements so optimistic state can roll back", async () => {
    const { repo } = fixture([]);
    await expect(repo.saveCardStatus("set", "card", "known")).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });
  it("resets progress through the server", async () => {
    const { repo, fetcher } = fixture(null);
    await repo.resetSetProgress("set");
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/sets/set/progress");
    expect(fetcher.mock.calls[0][1]?.method).toBe("DELETE");
  });
  it("reads test history", async () => {
    const { repo } = fixture([test]);
    expect(await repo.getTestResults("set")).toEqual([test]);
  });
  it("saves and corrects test scores using server-owned records", async () => {
    const { repo, fetcher } = fixture(test);
    expect(
      await repo.saveTestResult({ setId: "set", score: 1, total: 2, durationMs: 100 }),
    ).toEqual(test);
    await repo.updateTestResultScore("result", 2);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/test-results/result");
    expect(fetcher.mock.calls[1][1]?.method).toBe("PATCH");
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ score: 2 });
  });
  it("preserves the game filter and cursor pagination in history", async () => {
    const { repo, fetcher } = fixture([game]);
    expect(await repo.getGameScores("set", "match")).toEqual([game]);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/sets/set/game-scores?game=match&limit=50");
    await repo.getGameScores("set");
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/sets/set/game-scores?limit=50");
  });
  it("saves game scores", async () => {
    const { repo, fetcher } = fixture(game);
    expect(
      await repo.saveGameScore({ setId: "set", game: "match", score: 10, timeMs: 1000 }),
    ).toEqual(game);
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
  });
  it("records study activity without sending a user ID", async () => {
    const { repo, fetcher } = fixture(null);
    await repo.recordActivity("set");
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/sets/set/activity");
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
  it.each([
    [0, 1],
    [999, 50],
    [2.9, 2],
    [NaN, 1],
  ])("bounds activity limit %s to %s", async (limit, expected) => {
    const { repo, fetcher } = fixture([{ userId: "user", setId: "set", at: now }]);
    expect(await repo.getRecentActivity(limit)).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/activity?limit=${expected}`);
  });
});
