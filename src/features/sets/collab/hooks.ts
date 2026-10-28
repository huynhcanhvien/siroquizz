"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createHttpClient } from "@/lib/http-client";
import { setKeys } from "../hooks";
import { setAccessSchema } from "../schemas";
import {
  changeRequestDetailSchema,
  changeRequestSummarySchema,
  collaboratorCandidatesSchema,
  pendingReviewItemSchema,
  type ChangeOps,
} from "./schemas";

const client = createHttpClient();
export const collabKeys = {
  requests: (setId: string) => ["change-requests", "set", setId] as const,
  request: (id: string) => ["change-requests", id] as const,
  mine: ["change-requests", "mine"] as const,
  collaborators: (setId: string) => ["collaborators", setId] as const,
};

export function useChangeRequests(setId: string, status: "pending" | "all" = "pending") {
  return useQuery({
    queryKey: [...collabKeys.requests(setId), status],
    queryFn: async () =>
      (
        await client.request(
          `/api/v1/sets/${setId}/change-requests?status=${status}`,
          changeRequestSummarySchema.array(),
        )
      ).data,
  });
}
export function useChangeRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: collabKeys.request(id),
    queryFn: async () =>
      (await client.request(`/api/v1/change-requests/${id}`, changeRequestDetailSchema)).data,
    enabled,
  });
}
/** Home: proposals waiting for the person's review. */
export function usePendingReviews() {
  return useQuery({
    queryKey: collabKeys.mine,
    queryFn: async () =>
      (
        await client.request(
          "/api/v1/me/change-requests?status=pending",
          pendingReviewItemSchema.array(),
        )
      ).data,
  });
}

/** Refreshes the set, the library list and every change request query after a decision. */
function useInvalidateCollab(setId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: setKeys.detail(setId) }),
      queryClient.invalidateQueries({ queryKey: setKeys.all, exact: true }),
      queryClient.invalidateQueries({ queryKey: ["change-requests"] }),
    ]);
}
export interface ProposalInput {
  ops: ChangeOps;
  note: string;
  baseUpdatedAt: string;
  classId: string | null;
}
export function useProposeChange(setId: string) {
  const invalidate = useInvalidateCollab(setId);
  return useMutation({
    mutationFn: (body: ProposalInput) =>
      client.request(`/api/v1/sets/${setId}/change-requests`, z.object({ id: z.string() }), {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  });
}
export function useReviewChangeRequest(setId: string) {
  const invalidate = useInvalidateCollab(setId);
  return useMutation({
    mutationFn: ({
      id,
      action,
      reviewNote,
    }: {
      id: string;
      action: "approve" | "reject";
      reviewNote: string;
    }) =>
      client.request(`/api/v1/change-requests/${id}/${action}`, z.null(), {
        method: "POST",
        body: { reviewNote },
      }),
    onSuccess: invalidate,
  });
}
export function useWithdrawChangeRequest(setId: string) {
  const invalidate = useInvalidateCollab(setId);
  return useMutation({
    mutationFn: (id: string) =>
      client.request(`/api/v1/change-requests/${id}/withdraw`, z.null(), {
        method: "POST",
        body: {},
      }),
    onSuccess: invalidate,
  });
}

export function useCollaborators(setId: string, enabled = true) {
  return useQuery({
    queryKey: collabKeys.collaborators(setId),
    queryFn: async () =>
      (await client.request(`/api/v1/sets/${setId}/collaborators`, collaboratorCandidatesSchema))
        .data,
    enabled,
  });
}
export type Principal = { principalType: "user" | "class_teachers"; principalId: string };
export function useCollaboratorAction(setId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grant, principalType, principalId }: Principal & { grant: boolean }) =>
      grant
        ? client.request(`/api/v1/sets/${setId}/collaborators`, z.null(), {
            method: "PUT",
            body: { principalType, principalId },
          })
        : client.request(
            `/api/v1/sets/${setId}/collaborators/${principalType}/${principalId}`,
            z.null(),
            { method: "DELETE" },
          ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collabKeys.collaborators(setId) }),
  });
}
export function useAcceptsContributions(setId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accepts: boolean) =>
      client.request(`/api/v1/sets/${setId}/contributions`, setAccessSchema, {
        method: "PATCH",
        body: { accepts },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: setKeys.detail(setId) }),
  });
}
