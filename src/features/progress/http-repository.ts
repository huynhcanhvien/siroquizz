import { z } from "zod";
import { apiId, collectPages, createHttpClient, type HttpClient } from "@/lib/http-client";
import type { ProgressRepository } from "./repository";
import {
  cardProgressSchema,
  gameScoreSchema,
  studyActivitySchema,
  testResultSchema,
} from "./schemas";

export function createHttpProgressRepository(
  client: HttpClient = createHttpClient(),
): ProgressRepository {
  const path = (id: string) => `/api/v1/sets/${apiId(id)}`;
  return {
    getSetProgress: async (setId) =>
      (await client.request(`${path(setId)}/progress`, z.array(cardProgressSchema).max(500))).data,
    saveCardStatus: async (setId, cardId, status) => {
      const result = await client.request(
        `${path(setId)}/progress`,
        z.array(cardProgressSchema).length(1),
        {
          method: "PUT",
          body: { cards: [{ cardId, status }] },
        },
      );
      return result.data[0];
    },
    resetSetProgress: async (setId) => {
      await client.request(`${path(setId)}/progress`, z.null(), { method: "DELETE" });
    },
    getTestResults: (setId) =>
      collectPages(client, `${path(setId)}/test-results`, z.array(testResultSchema).max(50), 200),
    saveTestResult: async (input) =>
      (
        await client.request(`${path(input.setId)}/test-results`, testResultSchema, {
          method: "POST",
          body: input,
        })
      ).data,
    updateTestResultScore: async (id, score) =>
      (
        await client.request(`/api/v1/test-results/${apiId(id)}`, testResultSchema, {
          method: "PATCH",
          body: { score },
        })
      ).data,
    getGameScores: async (setId, game) => {
      // Game history is bounded to the latest 50 records per page; all pages are read for best-score calculation.
      const query = game ? `?game=${apiId(game)}` : "";
      return collectPages(
        client,
        `${path(setId)}/game-scores${query}`,
        z.array(gameScoreSchema).max(50),
        200,
      );
    },
    saveGameScore: async (input) =>
      (
        await client.request(`${path(input.setId)}/game-scores`, gameScoreSchema, {
          method: "POST",
          body: input,
        })
      ).data,
    recordActivity: async (setId) => {
      await client.request(`${path(setId)}/activity`, z.null(), { method: "POST" });
    },
    getRecentActivity: async (limit) => {
      const count = Math.max(1, Math.min(50, Math.trunc(limit) || 1));
      return (
        await client.request(
          `/api/v1/activity?limit=${count}`,
          z.array(studyActivitySchema).max(50),
        )
      ).data;
    },
  };
}
