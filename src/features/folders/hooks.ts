"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { studySetSchema } from "@/features/sets/schemas";
import { createHttpClient } from "@/lib/http-client";
import { folderDetailSchema, folderSummarySchema } from "./schemas";

const client = createHttpClient();
export const folderKeys = {
  all: ["folders"] as const,
  detail: (id: string) => ["folders", id] as const,
  study: (id: string) => ["folders", id, "study"] as const,
  ofSet: (setId: string) => ["folders", "of-set", setId] as const,
};

export function useFolders() {
  return useQuery({
    queryKey: folderKeys.all,
    queryFn: async () =>
      (await client.request("/api/v1/folders", folderSummarySchema.array())).data,
  });
}
export function useFolder(id: string, enabled = true) {
  return useQuery({
    queryKey: folderKeys.detail(id),
    queryFn: async () => (await client.request(`/api/v1/folders/${id}`, folderDetailSchema)).data,
    enabled,
  });
}
/** Every card of the folder merged into one practice set. */
export function useFolderStudySet(id: string) {
  return useQuery({
    queryKey: folderKeys.study(id),
    queryFn: async () => (await client.request(`/api/v1/folders/${id}/study`, studySetSchema)).data,
  });
}
export function useFoldersOfSet(setId: string, enabled: boolean) {
  return useQuery({
    queryKey: folderKeys.ofSet(setId),
    queryFn: async () =>
      (await client.request(`/api/v1/sets/${setId}/folders`, z.array(z.uuid()))).data,
    enabled,
  });
}

/** Any folder change invalidates every folder query (lists, details, memberships). */
function useInvalidateFolders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: folderKeys.all });
}
export function useCreateFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: async (name: string) =>
      (
        await client.request("/api/v1/folders", folderSummarySchema, {
          method: "POST",
          body: { name },
        })
      ).data,
    onSuccess: invalidate,
  });
}
export function useRenameFolder(id: string) {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: (name: string) =>
      client.request(`/api/v1/folders/${id}`, z.null(), { method: "PATCH", body: { name } }),
    onSuccess: invalidate,
  });
}
export function useDeleteFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: (id: string) =>
      client.request(`/api/v1/folders/${id}`, z.null(), { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
/** Adds (`member: true`) or removes a set from a folder. */
export function useFolderMembership() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: ({
      folderId,
      setId,
      member,
    }: {
      folderId: string;
      setId: string;
      member: boolean;
    }) =>
      client.request(`/api/v1/folders/${folderId}/sets/${setId}`, z.null(), {
        method: member ? "PUT" : "DELETE",
      }),
    onSuccess: invalidate,
  });
}
