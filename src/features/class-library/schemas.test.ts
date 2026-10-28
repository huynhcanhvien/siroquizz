import { describe, expect, it } from "vitest";
import { classLibraryItemSchema, itemShareSchema, libraryItemHref } from "./schemas";

describe("class library schemas", () => {
  it("links sets and folders to their pages", () => {
    expect(libraryItemHref({ itemType: "set", itemId: "a" })).toBe("/sets/a");
    expect(libraryItemHref({ itemType: "folder", itemId: "b" })).toBe("/folders/b");
  });

  it("parses library items and share rows", () => {
    expect(
      classLibraryItemSchema.safeParse({
        id: "i",
        itemType: "set",
        itemId: "s",
        title: "T",
        cardCount: 3,
        setCount: null,
        audience: "class",
        sharedAt: "",
        sharedBy: { id: "u", name: "An", avatarColor: "indigo" },
        canRemove: true,
      }).success,
    ).toBe(true);
    expect(
      itemShareSchema.parse({
        classId: "k",
        className: "10A",
        myRole: "student",
        libraryItemId: null,
        audience: null,
      }).libraryItemId,
    ).toBeNull();
    expect(itemShareSchema.safeParse({ classId: "k" }).success).toBe(false);
  });
});
