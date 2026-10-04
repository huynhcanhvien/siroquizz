"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import type { User } from "@/lib/types";

export function StudyShell({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: User | null;
}) {
  return (
    <AuthGuard initialUser={initialUser}>
      {() => <div className="flex min-h-dvh flex-col">{children}</div>}
    </AuthGuard>
  );
}
