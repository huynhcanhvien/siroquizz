"use client";

import { useSession } from "@/features/auth/hooks";
import { SettingsView } from "@/features/settings/components/SettingsView";

export default function SettingsPage() {
  const { data: user } = useSession();
  return user ? <SettingsView user={user} /> : null;
}
