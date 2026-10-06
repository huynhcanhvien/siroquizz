"use client";

import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SideNav } from "@/components/layout/SideNav";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { LocalImportBanner } from "@/features/auth/components/LocalImportBanner";
import { ResumeAiJob } from "@/features/ai-generate/components/ResumeAiJob";
import type { User } from "@/lib/types";

export function AppShell({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: User | null;
}) {
  return (
    <AuthGuard initialUser={initialUser}>
      {(user) => (
        <div className="flex min-h-dvh flex-col">
          <AppHeader user={user} />
          <div className="flex flex-1">
            <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 border-r border-border bg-surface/60 p-4 lg:block">
              <SideNav />
            </aside>
            <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
              <div className="mx-auto w-full max-w-6xl">
                {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
                  <>
                    <LocalImportBanner user={user} />
                    <ResumeAiJob />
                  </>
                ) : null}
                {children}
              </div>
            </main>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
