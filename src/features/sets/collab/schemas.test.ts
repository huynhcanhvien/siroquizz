import { describe, expect, it } from "vitest";
import {
  MAX_OPS_PER_REQUEST,
  changeOpsSchema,
  changeRequestDetailSchema,
  collaboratorCandidatesSchema,
  pendingReviewItemSchema,
  setAccessSchema,
} from "./schemas";

const add = { op: "add", card: { term: "a", definition: "b" } } as const;
const author = { id: "u1", name: "An", avatarColor: "indigo" };

describe("changeOpsSchema", () => {
  it("accepts up to the op limit and rejects more", () => {
    expect(changeOpsSchema.safeParse({ cards: Array(MAX_OPS_PER_REQUEST).fill(add) }).success).toBe(
      true,
    );
    expect(
      changeOpsSchema.safeParse({ cards: Array(MAX_OPS_PER_REQUEST + 1).fill(add) }).success,
    ).toBe(false);
  });

  it("refuses an empty proposal with the noChanges key", () => {
    const result = changeOpsSchema.safeParse({ cards: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("noChanges");
  });

  it("accepts a title-only or description-only change", () => {
    expect(changeOpsSchema.safeParse({ title: "New", cards: [] }).success).toBe(true);
    expect(changeOpsSchema.safeParse({ description: "", cards: [] }).success).toBe(true);
  });

  it("validates each op like an editor card", () => {
    expect(
      changeOpsSchema.safeParse({
        cards: [{ op: "edit", cardId: "c", card: { term: "", definition: "x" } }],
      }).success,
    ).toBe(false);
    expect(changeOpsSchema.safeParse({ cards: [{ op: "move", cardId: "c" }] }).success).toBe(false);
    const parsed = changeOpsSchema.parse({
      cards: [{ op: "edit", cardId: "c", card: { term: " t ", definition: "d", phonetic: "" } }],
    });
    expect(parsed.cards[0]).toEqual({
      op: "edit",
      cardId: "c",
      card: { term: "t", definition: "d" },
    });
  });
});

describe("response schemas", () => {
  it("parses set access with optional fields", () => {
    expect(
      setAccessSchema.parse({ isOwner: false, canEdit: false, acceptsContributions: true }),
    ).toEqual({
      isOwner: false,
      canEdit: false,
      acceptsContributions: true,
    });
    expect(
      setAccessSchema.safeParse({
        isOwner: false,
        canEdit: false,
        acceptsContributions: true,
        sharedIn: { classId: "c", className: "10A", sharedByName: "An", audience: "everyone" },
      }).success,
    ).toBe(false);
  });

  it("parses a change request with before/after cards", () => {
    const detail = changeRequestDetailSchema.parse({
      id: "r",
      setId: "s",
      classId: null,
      status: "pending",
      note: "",
      reviewNote: "",
      opCount: 2,
      titleChanged: true,
      title: "New",
      author,
      createdAt: "2026-10-29T00:00:00.000Z",
      reviewedAt: null,
      stale: false,
      cards: [
        { op: "edit", cardId: "c", before: null, card: { term: "a", definition: "b" } },
        { op: "delete", cardId: "d", before: { id: "d", term: "x", definition: "y" } },
      ],
    });
    expect(detail.cards).toHaveLength(2);
  });

  it("parses pending reviews and collaborator candidates", () => {
    expect(
      pendingReviewItemSchema.parse({
        id: "r",
        setId: "s",
        setTitle: "T",
        author,
        opCount: 1,
        createdAt: "",
        className: null,
      }).className,
    ).toBeNull();
    expect(
      collaboratorCandidatesSchema.parse({
        classes: [
          {
            classId: "c",
            className: "10A",
            myRole: "student",
            teachersGranted: false,
            members: [
              { userId: "t", name: "Mai", avatarColor: "rose", role: "owner", granted: true },
            ],
          },
        ],
      }).classes[0].members[0].granted,
    ).toBe(true);
  });
});
