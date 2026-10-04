import { purgeSetRecords } from "@/features/progress/repository";
import { createId, nowIso } from "@/lib/id";
import { RepositoryError } from "@/lib/repository-error";
import type { AppStorage } from "@/lib/storage";
import type { Card, SetInput, StudySet } from "@/lib/types";
import { SET_LIMITS, setInputSchema, studySetSchema, type ValidSetInput } from "./schemas";

export interface SetRepository {
  findAll(): Promise<StudySet[]>;
  findById(id: string): Promise<StudySet>;
  create(input: SetInput): Promise<StudySet>;
  update(id: string, input: SetInput): Promise<StudySet>;
  remove(id: string): Promise<void>;
  duplicate(id: string, title: string): Promise<StudySet>;
}

const SETS = "sets";

function validate(input: SetInput): ValidSetInput {
  const result = setInputSchema.safeParse(input);
  if (!result.success) throw new RepositoryError("VALIDATION", result.error.issues[0]?.message);
  return result.data;
}

/** Keeps ids of cards that already belong to the set so their progress survives edits. */
function toCards(cards: ValidSetInput["cards"], existingIds: ReadonlySet<string>): Card[] {
  return cards.map(({ id, term, definition, phonetic }) => ({
    id: id && existingIds.has(id) ? id : createId(),
    term,
    definition,
    ...(phonetic ? { phonetic } : {}),
  }));
}

interface LocalSetDeps {
  storage: AppStorage;
  getUserId: () => Promise<string | null>;
}

export function createLocalSetRepository({ storage, getUserId }: LocalSetDeps): SetRepository {
  const readAll = () => storage.readCollection(SETS, studySetSchema);

  const requireUser = async (): Promise<string> => {
    const userId = await getUserId();
    if (!userId) throw new RepositoryError("UNAUTHENTICATED");
    return userId;
  };

  const findOwned = async (id: string): Promise<StudySet> => {
    const userId = await requireUser();
    const set = readAll().find((item) => item.id === id && item.ownerId === userId);
    if (!set) throw new RepositoryError("NOT_FOUND");
    return set;
  };

  const replace = (updated: StudySet) =>
    storage.writeCollection(SETS, readAll().map((item) => (item.id === updated.id ? updated : item)));

  const insert = async (data: ValidSetInput): Promise<StudySet> => {
    const ownerId = await requireUser();
    const timestamp = nowIso();
    const set: StudySet = {
      ...data,
      id: createId(),
      ownerId,
      cards: toCards(data.cards, new Set()),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    storage.writeCollection(SETS, [...readAll(), set]);
    return set;
  };

  return {
    async findAll() {
      const userId = await requireUser();
      return readAll()
        .filter((set) => set.ownerId === userId)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    findById: findOwned,

    async create(input) {
      return insert(validate(input));
    },

    async update(id, input) {
      const existing = await findOwned(id);
      const data = validate(input);
      const existingIds = new Set(existing.cards.map((card) => card.id));
      const updated: StudySet = {
        ...existing,
        ...data,
        cards: toCards(data.cards, existingIds),
        updatedAt: nowIso(),
      };
      replace(updated);
      return updated;
    },

    async remove(id) {
      await findOwned(id);
      storage.writeCollection(SETS, readAll().filter((item) => item.id !== id));
      purgeSetRecords(storage, id);
    },

    async duplicate(id, title) {
      const source = await findOwned(id);
      return insert(
        validate({
          ...source,
          title: title.slice(0, SET_LIMITS.titleMax),
          cards: source.cards.map(({ term, definition, phonetic }) => ({ term, definition, phonetic })),
        }),
      );
    },
  };
}
