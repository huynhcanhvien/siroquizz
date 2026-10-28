import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/components/ui/Toast";
import messages from "../../../messages/vi.json";

const { review, saveCardStatus } = vi.hoisted(() => ({
  review: vi.fn(),
  saveCardStatus: vi.fn(),
}));
vi.mock("./http-repository", () => ({ createLearningRepository: () => ({ review }) }));
vi.mock("@/lib/data-provider", () => ({
  useRepositories: () => ({ progress: { saveCardStatus } }),
}));

import { useRefreshLearning, useReview } from "./hooks";
import { useBackgroundSave } from "./use-background-save";
import { useSaveCardStatus } from "@/features/progress/hooks";

let client: QueryClient;
const fetchers = { due: vi.fn(), stats: vi.fn(), progress: vi.fn() };
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <ToastProvider>{children}</ToastProvider>
    </NextIntlClientProvider>
  </QueryClientProvider>
);
/** Mounts the queries a review or swipe changes, as the review and set pages do. */
function useWatchedQueries() {
  useQuery({ queryKey: ["due", false, null], queryFn: fetchers.due });
  useQuery({ queryKey: ["stats"], queryFn: fetchers.stats });
  useQuery({ queryKey: ["progress", "s1"], queryFn: fetchers.progress });
}
async function mounted<T>(hook: () => T) {
  const view = renderHook(
    () => {
      useWatchedQueries();
      return hook();
    },
    { wrapper },
  );
  await waitFor(() => expect(fetchers.progress).toHaveBeenCalledTimes(1));
  for (const fetcher of Object.values(fetchers)) fetcher.mockClear();
  return view;
}
const isStale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  review.mockReset().mockResolvedValue({});
  saveCardStatus.mockReset().mockResolvedValue(undefined);
  fetchers.due.mockReset().mockResolvedValue({ cards: [] });
  fetchers.stats.mockReset().mockResolvedValue({});
  fetchers.progress.mockReset().mockResolvedValue([]);
});

describe("study writes do not refetch on every answer", () => {
  it("a graded review marks due, stats and progress stale without refetching them", async () => {
    const { result } = await mounted(() => useReview());
    await act(() =>
      result.current.mutateAsync({ cardId: "c1", rating: 3, mode: "review", durationMs: 1 }),
    );
    expect(review).toHaveBeenCalledTimes(1);
    expect(fetchers.due).not.toHaveBeenCalled();
    expect(fetchers.stats).not.toHaveBeenCalled();
    expect(fetchers.progress).not.toHaveBeenCalled();
    expect(isStale(["due", false, null])).toBe(true);
    expect(isStale(["stats"])).toBe(true);
    expect(isStale(["progress", "s1"])).toBe(true);
  });

  it("a flashcard swipe updates the progress cache locally and refetches nothing", async () => {
    const { result } = await mounted(() => useSaveCardStatus("s1"));
    await act(() => result.current.mutateAsync({ cardId: "c1", status: "known" }));
    expect(saveCardStatus).toHaveBeenCalledWith("s1", "c1", "known");
    expect(client.getQueryData(["progress", "s1"])).toMatchObject([
      { cardId: "c1", status: "known" },
    ]);
    expect(fetchers.progress).not.toHaveBeenCalled();
    expect(fetchers.due).not.toHaveBeenCalled();
    expect(fetchers.stats).not.toHaveBeenCalled();
    expect(isStale(["due", false, null])).toBe(true);
  });

  it("useRefreshLearning refetches the active learning queries once", async () => {
    const { result } = await mounted(() => useRefreshLearning());
    await act(() => result.current());
    expect(fetchers.due).toHaveBeenCalledTimes(1);
    expect(fetchers.stats).toHaveBeenCalledTimes(1);
    expect(fetchers.progress).toHaveBeenCalledTimes(1);
  });
});

describe("useBackgroundSave onExit", () => {
  it("runs once after the queued saves finish when the session unmounts", async () => {
    const events: string[] = [];
    const onExit = vi.fn(() => events.push("exit"));
    let release = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    const { result, unmount } = renderHook(() => useBackgroundSave({ onExit }), { wrapper });
    act(() =>
      result.current(async () => {
        await pending;
        events.push("save");
      }),
    );
    unmount();
    await act(async () => {});
    expect(onExit).not.toHaveBeenCalled();
    await act(async () => release());
    expect(events).toEqual(["save", "exit"]);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("skips onExit when nothing was saved", async () => {
    const onExit = vi.fn();
    const { unmount } = renderHook(() => useBackgroundSave({ onExit }), { wrapper });
    unmount();
    await act(async () => {});
    expect(onExit).not.toHaveBeenCalled();
  });
});
