import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "@/lib/http-client";
import type { SetInput, StudySet } from "@/lib/types";
import { createHttpSetRepository } from "./http-repository";

const input: SetInput = {
  title: "HSK",
  description: "",
  termLang: "zh",
  definitionLang: "vi",
  source: "manual",
  cards: [
    { term: "你好", definition: "xin chào" },
    { term: "谢谢", definition: "cảm ơn" },
  ],
};
const set: StudySet = {
  ...input,
  id: "set-1",
  ownerId: "user-1",
  createdAt: "2026-10-04T00:00:00Z",
  updatedAt: "2026-10-04T00:00:00Z",
  cards: input.cards.map((card, i) => ({ ...card, id: `card-${i}` })),
  cardCount: input.cards.length,
};
const ok = (data: unknown, meta?: unknown) => Response.json({ success: true, data, meta });

describe("HTTP set repository contract", () => {
  it("reads every page without dropping cards", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok([set], { nextCursor: "next" }))
      .mockResolvedValueOnce(ok([], { nextCursor: null }));
    expect(await createHttpSetRepository(createHttpClient(fetcher)).findAll()).toEqual([set]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps a resource ID inside a single path segment", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(set));
    expect(await createHttpSetRepository(createHttpClient(fetcher)).findById("set/1")).toEqual(set);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/sets/set%2F1");
  });
  it("creates using the editor payload and returns server-owned IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(set));
    const result = await createHttpSetRepository(createHttpClient(fetcher)).create(input);
    expect(result.id).toBe("set-1");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual(input);
  });
  it("updates the entire set, retaining card IDs in the submitted data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(set));
    const update = { ...input, cards: set.cards.toReversed() };
    await createHttpSetRepository(createHttpClient(fetcher)).update(set.id, update);
    expect(fetcher.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).cards[0].id).toBe("card-1");
  });
  it("requires an acknowledged delete", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(null));
    await expect(
      createHttpSetRepository(createHttpClient(fetcher)).remove(set.id),
    ).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.method).toBe("DELETE");
  });
  it("duplicates without sending a client-owned copy or IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(set));
    await createHttpSetRepository(createHttpClient(fetcher)).duplicate(set.id, "HSK copy");
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/sets/set-1/duplicate");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ title: "HSK copy" });
  });
  it("propagates ownership failures for the UI's translated error handling", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 }),
      );
    await expect(
      createHttpSetRepository(createHttpClient(fetcher)).findById(set.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
