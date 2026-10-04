"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/misc";
import { safeNextPath } from "@/lib/safe-redirect";
import type { User } from "@/lib/types";
import { sessionKey, useSession } from "../hooks";

function FullPageLoader() {
  const t = useTranslations("guard");
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className="animate-pulse">
          <Logo withWordmark={false} />
        </span>
        <p className="text-sm text-muted">{t("checking")}</p>
      </div>
    </div>
  );
}

/** Seeds the session query with the user the server layout already verified (skips a `/me` fetch). */
function useServerSession(initialUser: User | null | undefined) {
  const queryClient = useQueryClient();
  useState(() => {
    if (initialUser && queryClient.getQueryData(sessionKey) === undefined)
      queryClient.setQueryData<User | null>(sessionKey, initialUser);
  });
}

/**
 * Client-side guard. In HTTP mode the server layout has already checked the session and passes
 * `initialUser`, so this renders immediately; in local mode the session lives in localStorage.
 */
export function AuthGuard({
  children,
  initialUser,
}: {
  children: (user: User) => ReactNode;
  initialUser?: User | null;
}) {
  useServerSession(initialUser);
  const { data: user, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !user)
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
  }, [isPending, pathname, router, user]);

  if (isPending || !user) return <FullPageLoader />;
  return children(user);
}

/** Redirects signed-in users away from login/register pages. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (user) router.replace(safeNextPath(searchParams.get("next")));
  }, [router, searchParams, user]);

  if (isPending || user) return <FullPageLoader />;
  return children;
}
