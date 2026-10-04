"use client";

import { useSession } from "@/features/auth/hooks";
import { HomeDashboard } from "@/features/home/components/HomeDashboard";

export default function HomePage() {
  const { data: user } = useSession();
  return user ? <HomeDashboard user={user} /> : null;
}
