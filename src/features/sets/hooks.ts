"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepositories } from "@/lib/data-provider";
import type { SetInput, StudySet } from "@/lib/types";

export const setKeys = {
  all: ["sets"] as const,
  detail: (id: string) => ["sets", id] as const,
};

export function useSets() {
  const { sets } = useRepositories();
  return useQuery({ queryKey: setKeys.all, queryFn: () => sets.findAll() });
}

export function useSet(id: string) {
  const { sets } = useRepositories();
  return useQuery({ queryKey: setKeys.detail(id), queryFn: () => sets.findById(id) });
}

function useCacheSet() {
  const queryClient = useQueryClient();
  return (set: StudySet) => {
    queryClient.setQueryData(setKeys.detail(set.id), set);
    return queryClient.invalidateQueries({ queryKey: setKeys.all, exact: true });
  };
}

export function useCreateSet() {
  const { sets } = useRepositories();
  const cacheSet = useCacheSet();
  return useMutation({ mutationFn: (input: SetInput) => sets.create(input), onSuccess: cacheSet });
}

export function useUpdateSet(id: string) {
  const { sets } = useRepositories();
  const cacheSet = useCacheSet();
  return useMutation({ mutationFn: (input: SetInput) => sets.update(id, input), onSuccess: cacheSet });
}

export function useDuplicateSet() {
  const { sets } = useRepositories();
  const cacheSet = useCacheSet();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => sets.duplicate(id, title),
    onSuccess: cacheSet,
  });
}

export function useDeleteSet() {
  const { sets } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sets.remove(id),
    onSuccess: (_result, id) => {
      // Mark stale without refetching: removing it while the page is still mounted flashes "not found".
      void queryClient.invalidateQueries({ queryKey: setKeys.detail(id), refetchType: "none" });
      return queryClient.invalidateQueries({ queryKey: setKeys.all, exact: true });
    },
  });
}
