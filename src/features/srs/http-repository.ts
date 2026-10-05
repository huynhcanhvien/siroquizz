import { z } from "zod";
import { createHttpClient } from "@/lib/http-client";
import { preferencesSchema, dueResponseSchema, type reviewInputSchema } from "./schemas";
import { statsSchema } from "@/features/stats/schemas";
export function createLearningRepository() {
  const client = createHttpClient();
  return {
    /** Due cards, optionally only starred ones or only those of one folder's sets. */
    due: async (starred = false, folderId?: string) =>
      (
        await client.request(
          `/api/v1/reviews/due?starred=${starred ? "1" : "0"}${folderId ? `&folder=${folderId}` : ""}`,
          dueResponseSchema,
        )
      ).data,
    review: async (input: z.infer<typeof reviewInputSchema>) =>
      (await client.request("/api/v1/reviews", z.unknown(), { method: "POST", body: input })).data,
    stars: async (setId: string) =>
      (await client.request(`/api/v1/sets/${setId}/stars`, z.string().array())).data,
    star: async (cardId: string, value: boolean) =>
      client.request(`/api/v1/cards/${cardId}/star`, z.null(), {
        method: value ? "PUT" : "DELETE",
      }),
    preferences: async () =>
      (await client.request("/api/v1/me/preferences", preferencesSchema)).data,
    savePreferences: async (input: z.infer<typeof preferencesSchema>) =>
      (
        await client.request("/api/v1/me/preferences", preferencesSchema, {
          method: "PATCH",
          body: input,
        })
      ).data,
    stats: async () => (await client.request("/api/v1/stats/overview", statsSchema)).data,
    freeze: async () =>
      client.request("/api/v1/stats/freeze", z.object({ day: z.string() }), {
        method: "POST",
        body: {},
      }),
    startSession: async (setId: string | null, mode: string) =>
      (
        await client.request("/api/v1/sessions", z.object({ id: z.uuid() }), {
          method: "POST",
          body: { setId, mode },
        })
      ).data,
  };
}
