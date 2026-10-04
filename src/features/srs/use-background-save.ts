"use client";

import { useCallback, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import { RepositoryError } from "@/lib/repository-error";
import { useErrorMessage } from "@/lib/use-messages";

const SAVE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;
const TRANSIENT_ERRORS = new Set(["NETWORK", "UNKNOWN"]);

/** Reviews are idempotent by eventId, so a dropped request can safely be sent again. */
async function saveWithRetry(save: () => Promise<unknown>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await save();
      return;
    } catch (error) {
      const transient = error instanceof RepositoryError && TRANSIENT_ERRORS.has(error.code);
      if (!transient || attempt >= SAVE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
}

/**
 * Study answers are graded locally, so the UI moves on immediately and the server write follows.
 * Saves run one after another so FSRS sees a card's reviews in the order they happened; a save
 * that still fails after retries is reported with a toast.
 */
export function useBackgroundSave(): (save: () => Promise<unknown>) => void {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  return useCallback(
    (save) => {
      queue.current = queue.current
        .then(() => saveWithRetry(save))
        .catch((error: unknown) => toast(errorMessage(error), "error"));
    },
    [toast, errorMessage],
  );
}
