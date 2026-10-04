"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/components/AuthGuard";

export function StudyShell({ children }: { children: ReactNode }) {
  return <AuthGuard>{() => <div className="flex min-h-dvh flex-col">{children}</div>}</AuthGuard>;
}
