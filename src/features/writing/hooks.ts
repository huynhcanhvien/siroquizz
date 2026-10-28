"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { classKeys } from "@/features/classes/hooks";
import { setKeys } from "@/features/sets/hooks";
import { apiId, createHttpClient } from "@/lib/http-client";
import {
  docStateSchema,
  overviewSchema,
  scratchCardSchema,
  sessionDetailSchema,
  sessionSummarySchema,
  type DocSummary,
  type MaterializeInput,
  type Overview,
  type ScratchCard,
} from "./schemas";

const client = createHttpClient();
export const writingKeys = {
  all: ["writing"] as const,
  sessions: (classId: string) => ["writing", "class", classId] as const,
  session: (id: string) => ["writing", "session", id] as const,
  overview: (id: string) => ["writing", "session", id, "overview"] as const,
  doc: (docId: string) => ["writing", "doc", docId] as const,
  scratch: ["scratch-cards"] as const,
};
const sessionPath = (id: string) => `/api/v1/writing/sessions/${apiId(id)}`;

export function useWritingSessions(classId: string) {
  return useQuery({
    queryKey: writingKeys.sessions(classId),
    queryFn: async () =>
      (
        await client.request(
          `/api/v1/classes/${apiId(classId)}/writing`,
          sessionSummarySchema.array(),
        )
      ).data,
  });
}
export function useWritingSession(id: string) {
  return useQuery({
    queryKey: writingKeys.session(id),
    queryFn: async () => (await client.request(sessionPath(id), sessionDetailSchema)).data,
  });
}
/** Starts a document from the server copy; never cached, the editor owns it afterwards. */
export function useDocState(docId: string | null) {
  return useQuery({
    queryKey: writingKeys.doc(docId ?? ""),
    queryFn: async () =>
      (await client.request(`/api/v1/writing/docs/${apiId(docId!)}`, docStateSchema)).data,
    enabled: Boolean(docId),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** Create (POST to a class), change (PATCH) or delete a session; refreshes every writing query. */
export function useSessionAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "POST" | "PATCH" | "DELETE";
      body?: object;
    }) =>
      client.request(path, z.unknown(), {
        method,
        ...(method === "DELETE" ? {} : { body: body ?? {} }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: writingKeys.all }),
  });
}
export const createSessionPath = (classId: string) => `/api/v1/classes/${apiId(classId)}/writing`;
export { sessionPath };

/** Adds changed documents to the previous roster, by id. */
export function mergeOverview(previous: Overview | undefined, next: Overview): Overview {
  if (!previous) return next;
  const byId = new Map<string, DocSummary>(previous.docs.map((doc) => [doc.id, doc]));
  for (const doc of next.docs) byId.set(doc.id, doc);
  return { serverTime: next.serverTime, docs: [...byId.values()] };
}

/** The live roster: polls only documents changed since the last answer; pauses in hidden tabs. */
export function useOverview(id: string, { enabled, fast }: { enabled: boolean; fast: boolean }) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: writingKeys.overview(id),
    queryFn: async () => {
      const previous = queryClient.getQueryData<Overview>(writingKeys.overview(id));
      const query = previous ? `?since=${encodeURIComponent(previous.serverTime)}` : "";
      const { data } = await client.request(`${sessionPath(id)}/overview${query}`, overviewSchema);
      return mergeOverview(previous, data);
    },
    enabled,
    staleTime: 0,
    refetchInterval: fast ? 2_000 : 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useOpenOwnDoc(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await client.request(`${sessionPath(sessionId)}/docs`, z.object({ id: z.uuid() }), {
          method: "POST",
          body: {},
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: writingKeys.session(sessionId) }),
  });
}

export function useScratchCards() {
  return useQuery({
    queryKey: writingKeys.scratch,
    queryFn: async () =>
      (await client.request("/api/v1/me/scratch-cards", scratchCardSchema.array())).data,
  });
}
export interface ScratchDraft {
  term: string;
  definition: string;
  phonetic?: string | null;
  sourceDocId?: string | null;
}
/** Optimistic list update with rollback, shared by the scratch mutations. */
function useScratchMutation<V>(
  run: (variables: V) => Promise<unknown>,
  apply: (cards: ScratchCard[], variables: V) => ScratchCard[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onMutate: async (variables: V) => {
      await queryClient.cancelQueries({ queryKey: writingKeys.scratch });
      const previous = queryClient.getQueryData<ScratchCard[]>(writingKeys.scratch);
      if (previous) queryClient.setQueryData(writingKeys.scratch, apply(previous, variables));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(writingKeys.scratch, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: writingKeys.scratch }),
  });
}
export function useCreateScratch() {
  return useScratchMutation(
    (draft: ScratchDraft) =>
      client.request("/api/v1/me/scratch-cards", scratchCardSchema, {
        method: "POST",
        body: draft,
      }),
    (cards, draft) => [
      ...cards,
      {
        id: `00000000-0000-4000-8000-${String(cards.length).padStart(12, "0")}`,
        term: draft.term,
        definition: draft.definition,
        phonetic: draft.phonetic ?? null,
        example: null,
        sourceDocId: draft.sourceDocId ?? null,
        createdAt: new Date().toISOString(),
      },
    ],
  );
}
export function useUpdateScratch() {
  return useScratchMutation(
    ({ id, ...patch }: { id: string } & Partial<ScratchDraft>) =>
      client.request(`/api/v1/me/scratch-cards/${apiId(id)}`, scratchCardSchema, {
        method: "PATCH",
        body: patch,
      }),
    (cards, { id, ...patch }) =>
      cards.map((card) => (card.id === id ? ({ ...card, ...patch } as ScratchCard) : card)),
  );
}
export function useDeleteScratch() {
  return useScratchMutation(
    (id: string) =>
      client.request(`/api/v1/me/scratch-cards/${apiId(id)}`, z.unknown(), { method: "DELETE" }),
    (cards, id) => cards.filter((card) => card.id !== id),
  );
}
export function useClearScratch() {
  return useScratchMutation(
    (_: void) => client.request("/api/v1/me/scratch-cards", z.unknown(), { method: "DELETE" }),
    () => [],
  );
}
export function useMaterializeScratch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MaterializeInput) =>
      (
        await client.request(
          "/api/v1/me/scratch-cards/materialize",
          z.object({ setId: z.uuid() }),
          { method: "POST", body: input },
        )
      ).data,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: writingKeys.scratch }),
        queryClient.invalidateQueries({ queryKey: setKeys.all }),
        queryClient.invalidateQueries({ queryKey: classKeys.all }),
      ]),
  });
}
