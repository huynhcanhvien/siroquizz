import { createId, nowIso } from "@/lib/id";
import { RepositoryError } from "@/lib/repository-error";
import type { AppStorage } from "@/lib/storage";
import type { User } from "@/lib/types";
import {
  AVATAR_COLORS,
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  sessionSchema,
  storedAccountSchema,
  type LoginInput,
  type ProfileUpdate,
  type RegisterInput,
  type StoredAccount,
} from "./schemas";

export type { ProfileUpdate };

export interface AuthRepository {
  getSession(): Promise<User | null>;
  register(input: RegisterInput, uiLocale: string): Promise<User>;
  login(input: LoginInput): Promise<User>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updateProfile(update: ProfileUpdate): Promise<User>;
}

const ACCOUNTS = "accounts";
const SESSION = "session";

/**
 * MOCK ONLY — NOT SECURE. Hashing in the browser merely simulates the
 * "wrong password" flow for Phase 1. Phase 2 replaces this with server-side auth.
 */
async function mockPasswordHash(email: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`siroquizz-mock:${email}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toUser(account: StoredAccount): User {
  const { passwordHash: _passwordHash, ...user } = account;
  return user;
}

function parseOrThrow<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) throw new RepositoryError("VALIDATION");
  return result.data;
}

interface LocalAuthDeps {
  storage: AppStorage;
  sessionStorage: AppStorage;
}

export function createLocalAuthRepository({
  storage,
  sessionStorage,
}: LocalAuthDeps): AuthRepository {
  const readAccounts = () => storage.readCollection(ACCOUNTS, storedAccountSchema);

  const readSession = () =>
    storage.readValue(SESSION, sessionSchema) ?? sessionStorage.readValue(SESSION, sessionSchema);

  const startSession = (userId: string, remember: boolean) => {
    storage.remove(SESSION);
    sessionStorage.remove(SESSION);
    const target = remember ? storage : sessionStorage;
    target.writeValue(SESSION, { userId, createdAt: nowIso(), remember });
  };

  const currentAccount = (): StoredAccount | null => {
    const session = readSession();
    if (!session) return null;
    return readAccounts().find((account) => account.id === session.userId) ?? null;
  };

  return {
    async getSession() {
      const account = currentAccount();
      return account ? toUser(account) : null;
    },

    async register(input, uiLocale) {
      const data = parseOrThrow(registerSchema, input);
      const accounts = readAccounts();
      if (accounts.some((account) => account.email === data.email)) {
        throw new RepositoryError("EMAIL_TAKEN");
      }
      const account: StoredAccount = {
        id: createId(),
        email: data.email,
        displayName: data.displayName,
        avatarColor: AVATAR_COLORS[accounts.length % AVATAR_COLORS.length],
        uiLocale,
        createdAt: nowIso(),
        passwordHash: await mockPasswordHash(data.email, data.password),
      };
      storage.writeCollection(ACCOUNTS, [...accounts, account]);
      startSession(account.id, true);
      return toUser(account);
    },

    async login(input) {
      const data = parseOrThrow(loginSchema, input);
      const account = readAccounts().find((item) => item.email === data.email);
      const hash = await mockPasswordHash(data.email, data.password);
      if (!account || account.passwordHash !== hash)
        throw new RepositoryError("INVALID_CREDENTIALS");
      startSession(account.id, data.remember);
      return toUser(account);
    },

    async logout() {
      storage.remove(SESSION);
      sessionStorage.remove(SESSION);
    },

    async requestPasswordReset(email) {
      parseOrThrow(forgotPasswordSchema, { email });
      // Phase 2 sends a real email. The response never reveals whether the account exists.
    },

    async updateProfile(update) {
      const account = currentAccount();
      if (!account) throw new RepositoryError("UNAUTHENTICATED");
      const data = parseOrThrow(profileUpdateSchema, update);
      const updated: StoredAccount = {
        ...account,
        displayName: data.displayName ?? account.displayName,
        avatarColor: data.avatarColor ?? account.avatarColor,
        uiLocale: data.uiLocale ?? account.uiLocale,
      };
      const accounts = readAccounts().map((item) => (item.id === updated.id ? updated : item));
      storage.writeCollection(ACCOUNTS, accounts);
      return toUser(updated);
    },
  };
}
