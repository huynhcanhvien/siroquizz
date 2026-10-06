import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/features/admin/components/AdminNav";
import { getDatabase } from "@/server/db/client";
import { requirePageSession } from "@/server/page-session";
import { isAdmin } from "@/server/services/access";
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageSession();
  if (!user || !(await isAdmin(getDatabase(), user.id))) notFound();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminNav />
      {children}
    </div>
  );
}
