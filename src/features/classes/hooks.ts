"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createHttpClient } from "@/lib/http-client";
import {
  assignedItemSchema,
  classDetailSchema,
  classSummarySchema,
  progressBoardSchema,
} from "./schemas";

const client = createHttpClient();
export const classKeys = {
  all: ["classes"] as const,
  detail: (id: string) => ["classes", id] as const,
  progress: (id: string) => ["classes", id, "progress"] as const,
  assigned: ["classes", "assigned"] as const,
};

export function useClasses() {
  return useQuery({
    queryKey: classKeys.all,
    queryFn: async () => (await client.request("/api/v1/classes", classSummarySchema.array())).data,
  });
}
export function useClass(id: string) {
  return useQuery({
    queryKey: classKeys.detail(id),
    queryFn: async () => (await client.request(`/api/v1/classes/${id}`, classDetailSchema)).data,
  });
}
export function useProgressBoard(id: string, enabled: boolean) {
  return useQuery({
    queryKey: classKeys.progress(id),
    queryFn: async () =>
      (await client.request(`/api/v1/classes/${id}/progress`, progressBoardSchema)).data,
    enabled,
  });
}
export function useAssignedToMe() {
  return useQuery({
    queryKey: classKeys.assigned,
    queryFn: async () =>
      (await client.request("/api/v1/classes/assigned", assignedItemSchema.array())).data,
  });
}

/** One mutation hook for every class action; any success refreshes all class queries. */
export function useClassAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: object;
    }) =>
      client.request(`/api/v1/classes${path}`, z.unknown(), {
        method,
        ...(method === "DELETE" ? {} : { body: body ?? {} }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classKeys.all }),
  });
}
export const classIdSchema = z.object({ id: z.uuid() });
