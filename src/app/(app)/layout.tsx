import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageSession } from "@/server/page-session";
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageSession();
  return <AppShell initialUser={user}>{children}</AppShell>;
}
