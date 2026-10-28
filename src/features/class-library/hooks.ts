"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createHttpClient } from "@/lib/http-client";
import { classKeys } from "@/features/classes/hooks";
import {
  classLibraryItemSchema,
  itemShareSchema,
  myClassLibraryItemSchema,
  type LibraryAudience,
  type LibraryItemType,
} from "./schemas";

const client = createHttpClient();
/** Under ["classes"], so every class action also refreshes the libraries. */
export const classLibraryKeys = {
  ofClass: (classId: string) => ["classes", classId, "library"] as const,
  mine: ["classes", "library", "mine"] as const,
  shares: (type: LibraryItemType, id: string) =>
    ["classes", "library", "shares", type, id] as const,
};
const sharesPath = (type: LibraryItemType, id: string) =>
  `/api/v1/${type === "set" ? "sets" : "folders"}/${id}/shares`;

export function useClassLibrary(classId: string) {
  return useQuery({
    queryKey: classLibraryKeys.ofClass(classId),
    queryFn: async () =>
      (await client.request(`/api/v1/classes/${classId}/library`, classLibraryItemSchema.array()))
        .data,
  });
}
export function useMyClassLibrary(enabled = true) {
  return useQuery({
    queryKey: classLibraryKeys.mine,
    queryFn: async () =>
      (await client.request("/api/v1/me/class-library", myClassLibraryItemSchema.array())).data,
    enabled,
  });
}
export function useItemShares(type: LibraryItemType, id: string, enabled = true) {
  return useQuery({
    queryKey: classLibraryKeys.shares(type, id),
    queryFn: async () => (await client.request(sharesPath(type, id), itemShareSchema.array())).data,
    enabled,
  });
}

function useInvalidateClasses() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: classKeys.all });
}
export interface ShareInput {
  classId: string;
  itemType: LibraryItemType;
  itemId: string;
  audience: LibraryAudience;
}
export function useShareToClass() {
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: ({ classId, ...body }: ShareInput) =>
      client.request(`/api/v1/classes/${classId}/library`, z.object({ id: z.string() }), {
        method: "PUT",
        body,
      }),
    onSuccess: invalidate,
  });
}
export function useUnshare() {
  const invalidate = useInvalidateClasses();
  return useMutation({
    mutationFn: ({ classId, libraryItemId }: { classId: string; libraryItemId: string }) =>
      client.request(`/api/v1/classes/${classId}/library/${libraryItemId}`, z.null(), {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}
