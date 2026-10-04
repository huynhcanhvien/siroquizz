import type { ReactNode } from "react";
import { StudyShell } from "@/components/layout/StudyShell";
import { requirePageSession } from "@/server/page-session";
export default async function StudyLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return <StudyShell>{children}</StudyShell>;
}
