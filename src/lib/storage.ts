import type { z } from "zod";

const KEY_PREFIX = "siroquizz:v1:";

type StorageBackend = Pick<Storage, "getItem" | "setItem" | "removeItem"> &
  Partial<Pick<Storage, "key" | "length">>;

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}

export function storageKey(name: string): string {
  return `${KEY_PREFIX}${name}`;
}

function warn(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV !== "production") console.warn(`[storage] ${message}`, detail ?? "");
}

function parseJson(raw: string | null, name: string): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    warn(`Ignoring malformed JSON in "${name}"`, error);
    return null;
  }
}

export interface AppStorage {
  readCollection<T>(name: string, itemSchema: z.ZodType<T>): T[];
  writeCollection<T>(name: string, items: readonly T[]): void;
  readValue<T>(name: string, schema: z.ZodType<T>): T | null;
  writeValue<T>(name: string, value: T): void;
  remove(name: string): void;
  clearAll(): void;
}

export function createStorage(backend: StorageBackend | null): AppStorage {
  const read = (name: string): unknown => {
    if (!backend) return null;
    try {
      return parseJson(backend.getItem(storageKey(name)), name);
    } catch (error) {
      warn(`Cannot read "${name}"`, error);
      return null;
    }
  };

  const write = (name: string, value: unknown): void => {
    if (!backend) return;
    try {
      backend.setItem(storageKey(name), JSON.stringify(value));
    } catch (error) {
      throw new StorageError(`Cannot write "${name}" to storage`, { cause: error });
    }
  };

  return {
    readCollection(name, itemSchema) {
      const raw = read(name);
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((item) => {
        const parsed = itemSchema.safeParse(item);
        if (!parsed.success) warn(`Dropping invalid record in "${name}"`, parsed.error.issues);
        return parsed.success ? [parsed.data] : [];
      });
    },
    writeCollection: write,
    readValue(name, schema) {
      const parsed = schema.safeParse(read(name));
      return parsed.success ? parsed.data : null;
    },
    writeValue: write,
    remove(name) {
      backend?.removeItem(storageKey(name));
    },
    clearAll() {
      if (!backend?.key || backend.length === undefined) return;
      const keys = Array.from({ length: backend.length }, (_, i) => backend.key?.(i) ?? "");
      keys.filter((key) => key.startsWith(KEY_PREFIX)).forEach((key) => backend.removeItem(key));
    },
  };
}

export function getBrowserStorage(): AppStorage {
  if (typeof window === "undefined") return createStorage(null);
  try {
    return createStorage(window.localStorage);
  } catch {
    return createStorage(null);
  }
}
