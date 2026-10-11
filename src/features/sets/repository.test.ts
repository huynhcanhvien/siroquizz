import { beforeEach, describe, expect, it } from "vitest";
import { createLocalProgressRepository } from "@/features/progress/repository";
import { createStorage, type AppStorage } from "@/lib/storage";
import type { SetInput } from "@/lib/types";
import { createLocalSetRepository, type SetRepository } from "./repository";

const input: SetInput = {
  title: "Fruits",
  description: "Basic fruits",
  termLang: "en",
  definitionLang: "vi",
  source: "manual",
  cards: [
    { term: "apple", definition: "quả táo" },
    { term: "pear", definition: "quả lê", phonetic: "/peə/" },
  ],
};

describe("local SetRepository", () => {
  let storage: AppStorage;
  let userId: string | null;
  let repo: SetRepository;

  beforeEach(() => {
    storage = createStorage(window.localStorage);
    userId = "owner";
    repo = createLocalSetRepository({ storage, getUserId: async () => userId });
  });

  it("creates a set owned by the current user with generated card ids", async () => {
    const set = await repo.create(input);
    expect(set.ownerId).toBe("owner");
    expect(set.cards).toHaveLength(2);
    expect(new Set(set.cards.map((c) => c.id)).size).toBe(2);
    expect(set.cards[0]).not.toHaveProperty("phonetic");
    expect(set.cards[1].phonetic).toBe("/peə/");
  });

  it("lists only the current user's sets, newest first", async () => {
    const first = await repo.create(input);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await repo.create({ ...input, title: "Second" });
    userId = "someone-else";
    await repo.create({ ...input, title: "Not mine" });
    userId = "owner";
    expect((await repo.findAll()).map((s) => s.id)).toEqual([second.id, first.id]);
  });

  it("persists examples through reload, phonetic updates and duplication", async () => {
    const set = await repo.create(input);
    const saved = await repo.update(set.id, {
      ...set,
      cards: set.cards.map((card, index) => ({
        ...card,
        example: index === 0 ? "I eat an apple." : undefined,
      })),
    });
    const reloaded = await repo.findById(saved.id);
    expect(reloaded.cards[0].example).toBe("I eat an apple.");
    await repo.update(set.id, {
      ...reloaded,
      cards: reloaded.cards.map((card) => ({ ...card, phonetic: "/test/" })),
    });
    expect((await repo.findById(set.id)).cards[0].example).toBe("I eat an apple.");
    expect((await repo.duplicate(set.id, "Copy")).cards[0].example).toBe("I eat an apple.");
  });

  it("hides other users' sets as NOT_FOUND", async () => {
    const set = await repo.create(input);
    userId = "intruder";
    await expect(repo.findById(set.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.update(set.id, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.remove(set.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires authentication", async () => {
    userId = null;
    await expect(repo.findAll()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("validates input", async () => {
    await expect(repo.create({ ...input, cards: [input.cards[0]] })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "minCards",
    });
  });

  it("keeps ids of existing cards on update and assigns new ids to new cards", async () => {
    const set = await repo.create(input);
    const keptId = set.cards[0].id;
    const updated = await repo.update(set.id, {
      ...input,
      title: "Fruits v2",
      cards: [
        { id: keptId, term: "apple", definition: "táo" },
        { id: "forged-id", term: "plum", definition: "mận" },
      ],
    });
    expect(updated.title).toBe("Fruits v2");
    expect(updated.cards[0].id).toBe(keptId);
    expect(updated.cards[1].id).not.toBe("forged-id");
    expect(updated.createdAt).toBe(set.createdAt);
  });

  it("removes a set together with its progress", async () => {
    const progress = createLocalProgressRepository({ storage, getUserId: async () => userId });
    const set = await repo.create(input);
    await progress.saveCardStatus(set.id, set.cards[0].id, "known");
    await repo.remove(set.id);
    await expect(repo.findById(set.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(progress.getSetProgress(set.id)).resolves.toEqual([]);
  });

  it("duplicates a set with a new title and fresh ids", async () => {
    const set = await repo.create(input);
    const copy = await repo.duplicate(set.id, "Copy of Fruits");
    expect(copy.id).not.toBe(set.id);
    expect(copy.title).toBe("Copy of Fruits");
    expect(copy.cards.map((c) => c.term)).toEqual(["apple", "pear"]);
    expect(copy.cards[0].id).not.toBe(set.cards[0].id);
  });
});
