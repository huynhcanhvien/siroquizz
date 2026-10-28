"use client";

import { useCallback, useEffect, useRef } from "react";
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
export function useBackgroundSave({ onExit }: { onExit?: () => unknown } = {}): (
  save: () => Promise<unknown>,
) => void {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const saved = useRef(false);
  const exit = useRef(onExit);
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  useEffect(() => {
    exit.current = onExit;
  }, [onExit]);
  // When the session ends, `onExit` (e.g. refetching the review queue) runs once, after the
  // last queued save, so it reads what this session wrote.
  useEffect(() => {
    const pending = queue;
    return () => {
      if (!saved.current) return;
      saved.current = false;
      pending.current = pending.current
        .then(() => exit.current?.())
        .then(
          () => undefined,
          () => undefined,
        );
    };
  }, []);
  return useCallback(
    (save) => {
      saved.current = true;
      queue.current = queue.current
        .then(() => saveWithRetry(save))
        .catch((error: unknown) => toast(errorMessage(error), "error"));
    },
    [toast, errorMessage],
  );
}
