import type { ReactNode } from "react";
import { StudyShell } from "@/components/layout/StudyShell";
import { requirePageSession } from "@/server/page-session";
export default async function StudyLayout({ children }: { children: ReactNode }) {
  const user = await requirePageSession();
  return <StudyShell initialUser={user}>{children}</StudyShell>;
}
