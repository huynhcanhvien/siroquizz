"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { AiGenerationProvider } from "@/features/ai-generate/AiGenerationProvider";
import { DataProvider } from "@/lib/data-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <DataProvider>
        <ToastProvider>
          <AiGenerationProvider>{children}</AiGenerationProvider>
        </ToastProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
