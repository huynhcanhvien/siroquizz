"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useSession, useUpdateProfile } from "@/features/auth/hooks";
import { persistLocaleCookie, type Locale } from "./config";

export function useChangeLocale() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { data: user } = useSession();
  const updateProfile = useUpdateProfile();

  const changeLocale = (locale: Locale) => {
    persistLocaleCookie(locale);
    if (user) updateProfile.mutate({ uiLocale: locale });
    startTransition(() => router.refresh());
  };

  return { changeLocale, isPending };
}
