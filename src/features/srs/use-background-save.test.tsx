import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/components/ui/Toast";
import messages from "../../../messages/vi.json";
import { useBackgroundSave } from "./use-background-save";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
    <ToastProvider>{children}</ToastProvider>
  </NextIntlClientProvider>
);

describe("useBackgroundSave", () => {
  it("runs saves one at a time in submission order", async () => {
    const { result } = renderHook(() => useBackgroundSave(), { wrapper });
    const events: string[] = [];
    let releaseFirst = () => {};
    const first = new Promise<void>((resolve) => (releaseFirst = resolve));
    act(() => {
      result.current(async () => {
        events.push("first:start");
        await first;
        events.push("first:end");
      });
      result.current(async () => {
        events.push("second:start");
      });
    });
    await act(async () => {});
    expect(events).toEqual(["first:start"]);
    await act(async () => releaseFirst());
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });
});
