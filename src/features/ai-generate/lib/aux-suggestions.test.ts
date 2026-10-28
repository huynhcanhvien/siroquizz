import { describe, expect, it, vi } from "vitest";
import { RepositoryError } from "@/lib/repository-error";
import { fetchSuggestions } from "./aux-suggestions";

const client = (...answers: unknown[]) => {
  const request = vi.fn();
  for (const answer of answers)
    if (answer instanceof Error) request.mockRejectedValueOnce(answer);
    else request.mockResolvedValueOnce({ data: answer, nextCursor: null });
  return { request };
};

describe("fetchSuggestions", () => {
  it("waits as asked and sends the continuation with the remaining ids", async () => {
    const http = client(
      {
        cards: [{ id: "a", text: "1" }],
        partial: true,
        remainingIds: ["b"],
        retryAfterMs: 4000,
        continuation: "token",
      },
      { cards: [{ id: "b", text: "2" }], partial: false, remainingIds: [] },
    );
    const pause = vi.fn(async () => undefined);
    const progress = vi.fn();
    const result = await fetchSuggestions(http, "examples", "set", progress, pause);
    expect(result).toEqual({
      cards: [
        { id: "a", text: "1" },
        { id: "b", text: "2" },
      ],
      incomplete: null,
    });
    expect(pause).toHaveBeenCalledWith(4000);
    expect(http.request.mock.calls[1][2].body).toEqual({
      setId: "set",
      ids: ["b"],
      continuation: "token",
    });
    expect(progress).toHaveBeenLastCalledWith(2);
  });
  it("keeps what was found when a follow-up fails", async () => {
    const failure = new RepositoryError("RATE_LIMITED");
    const http = client(
      { cards: [{ id: "a", text: "1" }], partial: true, remainingIds: ["b"] },
      failure,
    );
    const result = await fetchSuggestions(http, "phonetics", "set", vi.fn(), vi.fn());
    expect(result).toEqual({ cards: [{ id: "a", text: "1" }], incomplete: failure });
    expect(http.request.mock.calls[0][2].body).toEqual({ setId: "set", scope: "all" });
  });
  it("throws when the first request fails", async () => {
    await expect(
      fetchSuggestions(client(new RepositoryError("NETWORK")), "examples", "s", vi.fn()),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });
});
