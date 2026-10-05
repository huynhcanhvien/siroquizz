import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { z } from "zod";
import type { StudySet } from "@/lib/types";
import { ApiError } from "../api-error";
import type { Database } from "../db/client";
import { cardImages, cards, folderSets, folders, studySets } from "../db/schema";
import { requireOwnedSet, type Db } from "./sets";

const MAX_FOLDERS = 100;
const MAX_SETS_PER_FOLDER = 500;
/** Cards a whole-folder study session merges; larger folders study their first sets. */
export const MAX_FOLDER_STUDY_CARDS = 500;
const nameSchema = z.object({ name: z.string().trim().min(1).max(60) });

async function requireFolder(db: Db, userId: string, id: string) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, z.uuid().parse(id)), eq(folders.userId, userId)))
    .limit(1);
  if (!folder) throw new ApiError(404, "NOT_FOUND");
  return folder;
}
/** Sets in a folder that still exist, in the folder's order. */
const liveFolderSets = (folderId: string) =>
  and(eq(folderSets.folderId, folderId), isNull(studySets.deletedAt));

export interface FolderSummary {
  id: string;
  name: string;
  setCount: number;
  updatedAt: string;
}
export async function listFolders(db: Database, userId: string): Promise<FolderSummary[]> {
  const rows = await db
    .select({
      id: folders.id,
      name: folders.name,
      updatedAt: folders.updatedAt,
      setCount: sql<number>`count(${studySets.id})::int`,
    })
    .from(folders)
    .leftJoin(folderSets, eq(folderSets.folderId, folders.id))
    .leftJoin(studySets, and(eq(studySets.id, folderSets.setId), isNull(studySets.deletedAt)))
    .where(eq(folders.userId, userId))
    .groupBy(folders.id)
    .orderBy(asc(folders.name));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function createFolder(db: Database, userId: string, input: unknown) {
  const { name } = nameSchema.parse(input);
  return db.transaction(async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.userId, userId));
    if (count >= MAX_FOLDERS) throw new ApiError(409, "CONFLICT");
    const [folder] = await tx.insert(folders).values({ id: v7(), userId, name }).returning();
    return {
      id: folder.id,
      name: folder.name,
      setCount: 0,
      updatedAt: folder.updatedAt.toISOString(),
    };
  });
}
export async function renameFolder(db: Database, userId: string, id: string, input: unknown) {
  const { name } = nameSchema.parse(input);
  await requireFolder(db, userId, id);
  await db.update(folders).set({ name, updatedAt: new Date() }).where(eq(folders.id, id));
}
/** Deletes the folder only; its sets stay in the library. */
export async function deleteFolder(db: Database, userId: string, id: string) {
  await requireFolder(db, userId, id);
  await db.delete(folders).where(eq(folders.id, id));
}

/** Puts one of the person's own sets into one of their folders (idempotent). */
export async function addSetToFolder(
  db: Database,
  userId: string,
  folderId: string,
  setId: string,
) {
  await db.transaction(async (tx) => {
    await requireFolder(tx, userId, folderId);
    await requireOwnedSet(tx, userId, setId);
    const [{ count, last }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        last: sql<number>`coalesce(max(${folderSets.position}), -1)::int`,
      })
      .from(folderSets)
      .where(eq(folderSets.folderId, folderId));
    if (count >= MAX_SETS_PER_FOLDER) throw new ApiError(409, "CONFLICT");
    await tx
      .insert(folderSets)
      .values({ folderId, setId, position: last + 1 })
      .onConflictDoNothing();
    await tx.update(folders).set({ updatedAt: new Date() }).where(eq(folders.id, folderId));
  });
}
export async function removeSetFromFolder(
  db: Database,
  userId: string,
  folderId: string,
  setId: string,
) {
  await requireFolder(db, userId, folderId);
  await db
    .delete(folderSets)
    .where(and(eq(folderSets.folderId, folderId), eq(folderSets.setId, z.uuid().parse(setId))));
}
/** Which of the person's folders contain a set (for the "add to folder" checklist). */
export async function foldersOfSet(db: Database, userId: string, setId: string) {
  await requireOwnedSet(db, userId, setId);
  const rows = await db
    .select({ id: folderSets.folderId })
    .from(folderSets)
    .innerJoin(folders, eq(folders.id, folderSets.folderId))
    .where(and(eq(folderSets.setId, setId), eq(folders.userId, userId)));
  return rows.map((row) => row.id);
}

export interface FolderDetail {
  id: string;
  name: string;
  sets: {
    id: string;
    title: string;
    cardCount: number;
    termLang: string;
    definitionLang: string;
  }[];
}
export async function getFolder(db: Database, userId: string, id: string): Promise<FolderDetail> {
  const folder = await requireFolder(db, userId, id);
  const sets = await db
    .select({
      id: studySets.id,
      title: studySets.title,
      cardCount: studySets.cardCount,
      termLang: studySets.termLang,
      definitionLang: studySets.definitionLang,
    })
    .from(folderSets)
    .innerJoin(studySets, eq(studySets.id, folderSets.setId))
    .where(liveFolderSets(id))
    .orderBy(asc(folderSets.position));
  return { id: folder.id, name: folder.name, sets };
}

/**
 * Every card of a folder's sets merged into one study set, for practice sessions (flashcards and
 * tests) that span sets. Languages come from the first set; progress is not saved per set here.
 */
export async function folderStudySet(db: Database, userId: string, id: string): Promise<StudySet> {
  const folder = await getFolder(db, userId, id);
  if (!folder.sets.length) throw new ApiError(404, "NOT_FOUND");
  const rows = await db
    .select({ card: cards, image: cardImages })
    .from(cards)
    .leftJoin(cardImages, eq(cardImages.cardId, cards.id))
    .where(
      inArray(
        cards.setId,
        folder.sets.map((set) => set.id),
      ),
    )
    .orderBy(asc(cards.setId), asc(cards.position))
    .limit(MAX_FOLDER_STUDY_CARDS);
  const order = new Map(folder.sets.map((set, index) => [set.id, index]));
  rows.sort(
    (a, b) =>
      order.get(a.card.setId)! - order.get(b.card.setId)! || a.card.position - b.card.position,
  );
  const first = folder.sets[0];
  const now = new Date().toISOString();
  return {
    id: folder.id,
    ownerId: userId,
    title: folder.name,
    description: "",
    termLang: first.termLang as StudySet["termLang"],
    definitionLang: first.definitionLang as StudySet["definitionLang"],
    source: "manual",
    cards: rows.map(({ card, image }) => ({
      id: card.id,
      term: card.term,
      definition: card.definition,
      ...(card.phonetic ? { phonetic: card.phonetic } : {}),
      ...(image ? { imageUrl: `/api/v1/images/${image.id}`, imageAlt: image.alt } : {}),
    })),
    createdAt: now,
    updatedAt: now,
  };
}
