"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useHydrated } from "@/lib/client-hooks";
import { getBrowserStorage } from "@/lib/storage";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";
import { storedAccountSchema } from "../schemas";
import { studySetSchema } from "@/features/sets/schemas";
import {
  cardProgressSchema,
  gameScoreSchema,
  studyActivitySchema,
  testResultSchema,
} from "@/features/progress/schemas";
import type { User } from "@/lib/types";

export function LocalImportBanner({ user }: { user: User }) {
  const t = useTranslations("account");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const cache = useQueryClient();
  const [done, setDone] = useState(false);
  const hydrated = useHydrated();
  const payload = useMemo(() => {
    if (!hydrated) return null;
    const storage = getBrowserStorage();
    const local = storage
      .readCollection("accounts", storedAccountSchema)
      .find((account) => account.email === user.email);
    if (!local) return null;
    const mine = <T extends { userId: string }>(rows: T[]) =>
      rows.filter((row) => row.userId === local.id);
    return {
      sets: storage
        .readCollection("sets", studySetSchema)
        .filter((set) => set.ownerId === local.id),
      progress: mine(storage.readCollection("progress", cardProgressSchema)),
      testResults: mine(storage.readCollection("testResults", testResultSchema)),
      gameScores: mine(storage.readCollection("gameScores", gameScoreSchema)),
      activity: mine(storage.readCollection("activity", studyActivitySchema)),
    };
  }, [hydrated, user.email]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!payload) return;
      const result = await createHttpClient().request(
        "/api/v1/import/local",
        z.object({ imported: z.array(z.string()) }),
        { method: "POST", body: payload },
      );
      // Only remove acknowledged records. Never clear another local account's data.
      const ids = new Set(result.data.imported);
      const storage = getBrowserStorage();
      storage.writeCollection(
        "sets",
        storage.readCollection("sets", studySetSchema).filter((set) => !ids.has(set.id)),
      );
      storage.writeCollection(
        "progress",
        storage.readCollection("progress", cardProgressSchema).filter((r) => !ids.has(r.setId)),
      );
      storage.writeCollection(
        "testResults",
        storage.readCollection("testResults", testResultSchema).filter((r) => !ids.has(r.setId)),
      );
      storage.writeCollection(
        "gameScores",
        storage.readCollection("gameScores", gameScoreSchema).filter((r) => !ids.has(r.setId)),
      );
      storage.writeCollection(
        "activity",
        storage.readCollection("activity", studyActivitySchema).filter((r) => !ids.has(r.setId)),
      );
      setDone(true);
      await cache.invalidateQueries();
      toast(t("importDone"));
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  if (done || !payload?.sets.length) return null;
  return (
    <div
      role="region"
      aria-label={t("importTitle")}
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft p-4"
    >
      <p>{t("importPrompt", { count: payload.sets.length })}</p>
      <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
        {t("importTitle")}
      </Button>
    </div>
  );
}
