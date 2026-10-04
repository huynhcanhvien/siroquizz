import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/misc";

/** Instant route-transition placeholder: mirrors a page title plus a grid of set cards. */
export async function PageSkeleton() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Full-screen variant for study modes, which render without the app chrome. */
export async function StudySkeleton() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex h-16 items-center gap-4 border-b border-border px-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4">
        <Skeleton className="h-72 w-full rounded-3xl" />
        <Skeleton className="h-11 w-64 rounded-full" />
      </div>
    </div>
  );
}
