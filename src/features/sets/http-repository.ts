import { z } from "zod";
import { apiId, collectPages, createHttpClient, type HttpClient } from "@/lib/http-client";
import type { SetRepository } from "./repository";
import { studySetSchema } from "./schemas";

export function createHttpSetRepository(client: HttpClient = createHttpClient()): SetRepository {
  const path = (id: string) => `/api/v1/sets/${apiId(id)}`;
  return {
    findAll: () => collectPages(client, "/api/v1/sets", z.array(studySetSchema).max(50)),
    findById: async (id) => (await client.request(path(id), studySetSchema)).data,
    create: async (input) =>
      (await client.request("/api/v1/sets", studySetSchema, { method: "POST", body: input })).data,
    update: async (id, input) =>
      (await client.request(path(id), studySetSchema, { method: "PUT", body: input })).data,
    remove: async (id) => {
      await client.request(path(id), z.null(), { method: "DELETE" });
    },
    duplicate: async (id, title) =>
      (
        await client.request(`${path(id)}/duplicate`, studySetSchema, {
          method: "POST",
          body: { title },
        })
      ).data,
  };
}
