"use client";

import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { RepositoryError } from "@/lib/repository-error";
import type { StudySet } from "@/lib/types";
import { useSet } from "../hooks";

export function SetNotFound() {
  const t = useTranslations("set");
  return (
    <EmptyState
      icon={<FileQuestion aria-hidden />}
      title={t("notFoundTitle")}
      body={t("notFoundBody")}
      action={
        <Button asChild variant="secondary">
          <Link href="/library">{t("backToLibrary")}</Link>
        </Button>
      }
    />
  );
}

interface SetLoaderProps {
  id: string;
  children: (set: StudySet) => ReactNode;
  fallback?: ReactNode;
}

/** Loads a set and renders loading / not-found / error states consistently. */
export function SetLoader({ id, children, fallback }: SetLoaderProps) {
  const { data, isPending, isError, error, refetch } = useSet(id);
  if (isPending) {
    return (
      fallback ?? (
        <div className="flex flex-col gap-6" aria-busy>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      )
    );
  }
  if (isError) {
    if (error instanceof RepositoryError && error.code === "NOT_FOUND") return <SetNotFound />;
    return <QueryError error={error} onRetry={() => refetch()} />;
  }
  return children(data);
}
