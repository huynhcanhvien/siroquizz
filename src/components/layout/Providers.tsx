"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { DataProvider } from "@/lib/data-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <DataProvider>
        <ToastProvider>{children}</ToastProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
