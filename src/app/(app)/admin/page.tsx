import { notFound } from "next/navigation";
import { AdminPanel } from "@/features/community/components/AdminPanel";
import { getDatabase } from "@/server/db/client";
import { requirePageSession } from "@/server/page-session";
import { isAdmin } from "@/server/services/access";

export default async function AdminPage() {
  const user = await requirePageSession();
  // The role is checked in the database; the session cookie may be minutes old.
  if (!user || !(await isAdmin(getDatabase(), user.id))) notFound();
  return <AdminPanel />;
}
