"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { v7 } from "uuid";
import type { z } from "zod";
import { useCountStudyAnswer, type SessionCounts } from "@/features/study/session-context";
import { createEngagementTimer } from "./engagement-timer";
import { createLearningRepository } from "./http-repository";
import type { preferencesSchema } from "./schemas";
const repository = createLearningRepository();
export const learningKeys = {
  due: ["due"] as const,
  stars: (setId: string) => ["stars", setId] as const,
  preferences: ["preferences"] as const,
  stats: ["stats"] as const,
};
const isHttp = process.env.NEXT_PUBLIC_DATA_SOURCE === "http";
export function useDue(starred = false) {
  return useQuery({
    queryKey: [...learningKeys.due, starred],
    queryFn: () => repository.due(starred),
    enabled: isHttp,
  });
}
export function useStars(setId: string) {
  return useQuery({
    queryKey: learningKeys.stars(setId),
    queryFn: () => repository.stars(setId),
    enabled: isHttp,
  });
}
export function useStar(setId: string) {
  const client = useQueryClient(),
    key = learningKeys.stars(setId);
  return useMutation({
    mutationFn: ({ cardId, starred }: { cardId: string; starred: boolean }) =>
      repository.star(cardId, starred),
    onMutate: async ({ cardId, starred }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<string[]>(key);
      client.setQueryData<string[]>(key, (current) =>
        starred
          ? [...new Set([...(current ?? []), cardId])]
          : (current ?? []).filter((id) => id !== cardId),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => client.setQueryData(key, ctx?.previous),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
export function useReview() {
  const client = useQueryClient(),
    count = useCountStudyAnswer();
  return useMutation({
    mutationFn: (input: {
      cardId: string;
      rating: number;
      mode: "learn" | "review" | "flashcards";
      durationMs: number;
      eventId?: string;
    }) => repository.review({ ...input, eventId: input.eventId ?? v7() }),
    onSuccess: (_data, input) => {
      count?.(input.rating >= 2);
      void client.invalidateQueries({ queryKey: learningKeys.due });
      void client.invalidateQueries({ queryKey: learningKeys.stats });
      void client.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}
export function usePreferences() {
  return useQuery({
    queryKey: learningKeys.preferences,
    queryFn: repository.preferences,
    enabled: isHttp,
  });
}
export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: z.infer<typeof preferencesSchema>) => repository.savePreferences(input),
    onSuccess: (data) => {
      client.setQueryData(learningKeys.preferences, data);
      void client.invalidateQueries({ queryKey: learningKeys.due });
      void client.invalidateQueries({ queryKey: learningKeys.stats });
    },
  });
}
export function useStats() {
  return useQuery({ queryKey: learningKeys.stats, queryFn: repository.stats, enabled: isHttp });
}
export function useFreeze() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: repository.freeze,
    onSuccess: () => client.invalidateQueries({ queryKey: learningKeys.stats }),
  });
}
const ENGAGEMENT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
export function useSessionRecording(setId: string | null, mode: string) {
  const counts = useRef<SessionCounts>({ cardsSeen: 0, correct: 0, incorrect: 0 });
  useEffect(() => {
    if (!isHttp) return;
    let id: string | null = null,
      closed = false;
    const timer = createEngagementTimer(Date.now());
    const touch = () => timer.touch(Date.now());
    // Reports are cumulative: the server keeps the largest values, so sending on every hide is safe.
    const report = () => {
      if (!id) return;
      void fetch(`/api/v1/sessions/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...counts.current, activeSeconds: timer.seconds(Date.now()) }),
      }).catch(() => {});
    };
    void repository
      .startSession(setId, mode)
      .then((result) => {
        id = result.id;
        if (closed) report();
      })
      .catch(() => {});
    const visibility = () => {
      if (document.visibilityState !== "hidden") return touch();
      timer.pause(Date.now());
      report();
    };
    for (const event of ENGAGEMENT_EVENTS)
      window.addEventListener(event, touch, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      closed = true;
      for (const event of ENGAGEMENT_EVENTS)
        window.removeEventListener(event, touch, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      report();
    };
  }, [setId, mode]);
  return (correct: boolean) => {
    counts.current.cardsSeen++;
    counts.current.correct += Number(correct);
    counts.current.incorrect += Number(!correct);
  };
}
