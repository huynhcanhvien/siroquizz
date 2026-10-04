"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CardGenerator } from "@/features/ai-generate/lib/generator";
import { createApiGenerator } from "@/features/ai-generate/lib/api-generator";
import { createMockGenerator } from "@/features/ai-generate/lib/mock-generator";
import { sessionKey } from "@/features/auth/query-keys";
import { createLocalAuthRepository, type AuthRepository } from "@/features/auth/repository";
import { createHttpAuthRepository } from "@/features/auth/http-repository";
import { createHttpSetRepository } from "@/features/sets/http-repository";
import { createHttpProgressRepository } from "@/features/progress/http-repository";
import {
  createLocalProgressRepository,
  type ProgressRepository,
} from "@/features/progress/repository";
import { createLocalSetRepository, type SetRepository } from "@/features/sets/repository";
import { RepositoryError } from "./repository-error";
import { createStorage, getBrowserStorage, storageKey } from "./storage";

export interface Repositories {
  auth: AuthRepository;
  sets: SetRepository;
  progress: ProgressRepository;
  cardGenerator: CardGenerator;
}

const RepositoriesContext = createContext<Repositories | null>(null);

function getBrowserSessionStorage() {
  if (typeof window === "undefined") return createStorage(null);
  try {
    return createStorage(window.sessionStorage);
  } catch {
    return createStorage(null);
  }
}

/**
 * Phase 1 wires localStorage-backed repositories. Phase 2 swaps these factories
 * for HTTP implementations without touching hooks or components.
 */
export function createLocalRepositories(): Repositories {
  const storage = getBrowserStorage();
  const auth = createLocalAuthRepository({ storage, sessionStorage: getBrowserSessionStorage() });
  const getUserId = async () => (await auth.getSession())?.id ?? null;
  return {
    auth,
    sets: createLocalSetRepository({ storage, getUserId }),
    progress: createLocalProgressRepository({ storage, getUserId }),
    cardGenerator: createMockGenerator(),
  };
}

export function createRepositories(): Repositories {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http")
    return {
      auth: createHttpAuthRepository(),
      sets: createHttpSetRepository(),
      progress: createHttpProgressRepository(),
      cardGenerator: createApiGenerator(),
    };
  return createLocalRepositories();
}

const NON_RETRYABLE = new Set([
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "VALIDATION",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "CONFLICT",
  "RATE_LIMITED",
]);

function createQueryClient(): QueryClient {
  // Any request that finds the session gone signs the user out locally; AuthGuard then redirects.
  const onError = (error: unknown) => {
    if (error instanceof RepositoryError && error.code === "UNAUTHENTICATED")
      client.setQueryData(sessionKey, null);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof RepositoryError && NON_RETRYABLE.has(error.code)) && failureCount < 2,
      },
    },
  });
  return client;
}

/** Another tab changed our data (login, logout, edits): refetch so this tab doesn't act on stale state. */
function useCrossTabSync(queryClient: QueryClient) {
  useEffect(() => {
    const prefix = storageKey("");
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(prefix)) void queryClient.invalidateQueries();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [queryClient]);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const [repositories] = useState(createRepositories);
  useCrossTabSync(queryClient);

  return (
    <RepositoriesContext.Provider value={repositories}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RepositoriesContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (!repositories) throw new Error("useRepositories must be used inside <DataProvider>");
  return repositories;
}
