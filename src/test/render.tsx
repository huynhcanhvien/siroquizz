import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { DataProvider } from "@/lib/data-provider";
import messages from "../../messages/vi.json";

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};

export const navigation = {
  pathname: "/",
  searchParams: new URLSearchParams(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  useParams: () => ({}),
  notFound: vi.fn(),
}));

/** Renders with the real Vietnamese messages, localStorage-backed repositories and toasts. */
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(
    <NextIntlClientProvider locale="vi" messages={messages} timeZone="Asia/Ho_Chi_Minh">
      <DataProvider>
        <ToastProvider>{ui}</ToastProvider>
      </DataProvider>
    </NextIntlClientProvider>,
  );
}
