"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCountStudyAnswer } from "@/features/study/session-context";
import { useRepositories } from "@/lib/data-provider";
import type { CardProgress, CardStatus } from "@/lib/types";
import type { GameScoreInput, TestResultInput } from "./schemas";

export const progressKeys = {
  set: (setId: string) => ["progress", setId] as const,
  tests: (setId: string) => ["testResults", setId] as const,
  games: (setId: string) => ["gameScores", setId] as const,
  activity: ["activity"] as const,
};

export function useSetProgress(setId: string) {
  const { progress } = useRepositories();
  return useQuery({
    queryKey: progressKeys.set(setId),
    queryFn: () => progress.getSetProgress(setId),
  });
}

/** Optimistically updates card status and rolls back if the write fails. */
export function useSaveCardStatus(setId: string) {
  const count = useCountStudyAnswer();
  const { progress } = useRepositories();
  const queryClient = useQueryClient();
  const key = progressKeys.set(setId);

  return useMutation({
    mutationFn: ({ cardId, status }: { cardId: string; status: CardStatus }) =>
      progress.saveCardStatus(setId, cardId, status),
    onMutate: async ({ cardId, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CardProgress[]>(key);
      queryClient.setQueryData<CardProgress[]>(key, (current = []) => [
        ...current.filter((item) => item.cardId !== cardId),
        { userId: "", setId, cardId, status, updatedAt: new Date().toISOString() },
      ]);
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(key, context?.previous),
    onSuccess: (_data, input) => {
      count?.(input.status === "known");
      void queryClient.invalidateQueries({ queryKey: ["due"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useResetProgress(setId: string) {
  const { progress } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => progress.resetSetProgress(setId),
    onSuccess: () => queryClient.setQueryData<CardProgress[]>(progressKeys.set(setId), []),
  });
}

export function useTestResults(setId: string) {
  const { progress } = useRepositories();
  return useQuery({
    queryKey: progressKeys.tests(setId),
    queryFn: () => progress.getTestResults(setId),
  });
}

export function useSaveTestResult() {
  const { progress } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TestResultInput) => progress.saveTestResult(input),
    onSuccess: (result) =>
      queryClient.invalidateQueries({ queryKey: progressKeys.tests(result.setId) }),
  });
}

export function useUpdateTestResultScore() {
  const { progress } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score }: { id: string; score: number }) =>
      progress.updateTestResultScore(id, score),
    onSuccess: (result) =>
      queryClient.invalidateQueries({ queryKey: progressKeys.tests(result.setId) }),
  });
}

export function useGameScores(setId: string) {
  const { progress } = useRepositories();
  return useQuery({
    queryKey: progressKeys.games(setId),
    queryFn: () => progress.getGameScores(setId),
  });
}

export function useSaveGameScore() {
  const { progress } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GameScoreInput) => progress.saveGameScore(input),
    onSuccess: (score) =>
      queryClient.invalidateQueries({ queryKey: progressKeys.games(score.setId) }),
  });
}

export function useRecentActivity(limit: number) {
  const { progress } = useRepositories();
  return useQuery({
    queryKey: [...progressKeys.activity, limit],
    queryFn: () => progress.getRecentActivity(limit),
  });
}

/** Records that the user opened a study mode so "Continue studying" can surface the set. */
export function useRecordActivity(setId: string, enabled: boolean) {
  const { progress } = useRepositories();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    progress
      .recordActivity(setId)
      .then(() => queryClient.invalidateQueries({ queryKey: progressKeys.activity }))
      .catch((error: unknown) => console.error("Failed to record study activity", error));
  }, [enabled, progress, queryClient, setId]);
}
