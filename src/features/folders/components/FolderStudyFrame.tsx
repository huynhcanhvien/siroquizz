"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import type { StudySet } from "@/lib/types";
import { useFolderStudySet } from "../hooks";

/**
 * Shell for practising a whole folder: every set's cards merged into one session. Nothing is
 * recorded per set, which the top bar says plainly.
 */
export function FolderStudyFrame({
  folderId,
  children,
}: {
  folderId: string;
  children: (set: StudySet) => ReactNode;
}) {
  const t = useTranslations("folders");
  const study = useFolderStudySet(folderId);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
          <span className="justify-self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-text">
            {t("practiceBadge")}
          </span>
          <p className="min-w-0 truncate text-center font-bold">{study.data?.title}</p>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="justify-self-end"
            aria-label={t("back")}
          >
            <Link href={`/folders/${folderId}`}>
              <X className="size-5" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>
      <main id="main" className="flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {study.error ? (
          <QueryError error={study.error} onRetry={() => void study.refetch()} />
        ) : study.data ? (
          children(study.data)
        ) : (
          <Skeleton className="mx-auto h-80 max-w-3xl" />
        )}
      </main>
    </>
  );
}
