import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createStorage, storageKey } from "./storage";

const itemSchema = z.object({ id: z.string(), value: z.number() });

describe("createStorage", () => {
  it("writes and reads back a valid collection", () => {
    const storage = createStorage(window.localStorage);
    storage.writeCollection("items", [{ id: "a", value: 1 }]);
    expect(storage.readCollection("items", itemSchema)).toEqual([{ id: "a", value: 1 }]);
  });

  it("uses a versioned key", () => {
    const storage = createStorage(window.localStorage);
    storage.writeCollection("items", []);
    expect(window.localStorage.getItem(storageKey("items"))).toBe("[]");
    expect(storageKey("items")).toBe("siroquizz:v1:items");
  });

  it("drops invalid records but keeps valid ones", () => {
    window.localStorage.setItem(
      storageKey("items"),
      JSON.stringify([{ id: "a", value: 1 }, { id: 2 }, { id: "b", value: 2 }]),
    );
    const storage = createStorage(window.localStorage);
    expect(storage.readCollection("items", itemSchema)).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
  });

  it("returns an empty list for malformed JSON", () => {
    window.localStorage.setItem(storageKey("items"), "{not json");
    const storage = createStorage(window.localStorage);
    expect(storage.readCollection("items", itemSchema)).toEqual([]);
  });

  it("returns an empty list when the stored value is not an array", () => {
    window.localStorage.setItem(storageKey("items"), JSON.stringify({ id: "a" }));
    expect(createStorage(window.localStorage).readCollection("items", itemSchema)).toEqual([]);
  });

  it("reads and writes a single value", () => {
    const storage = createStorage(window.localStorage);
    storage.writeValue("session", { id: "a", value: 3 });
    expect(storage.readValue("session", itemSchema)).toEqual({ id: "a", value: 3 });
    storage.remove("session");
    expect(storage.readValue("session", itemSchema)).toBeNull();
  });

  it("works without a backend (server or blocked storage)", () => {
    const storage = createStorage(null);
    storage.writeCollection("items", [{ id: "a", value: 1 }]);
    expect(storage.readCollection("items", itemSchema)).toEqual([]);
    expect(storage.readValue("session", itemSchema)).toBeNull();
  });

  it("throws a StorageError when the backend refuses to write", () => {
    const backend = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
      removeItem: () => undefined,
    };
    const storage = createStorage(backend);
    expect(() => storage.writeCollection("items", [])).toThrowError(/storage/i);
  });

  it("clears only SiroQuizz keys", () => {
    window.localStorage.setItem("other-app", "keep");
    const storage = createStorage(window.localStorage);
    storage.writeCollection("items", []);
    storage.clearAll();
    expect(window.localStorage.getItem("other-app")).toBe("keep");
    expect(window.localStorage.getItem(storageKey("items"))).toBeNull();
  });
});
