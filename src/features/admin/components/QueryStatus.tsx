"use client";
import { useTranslations } from "next-intl";
import { QueryError } from "@/components/ui/QueryState";
export function QueryStatus({
  query,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
}) {
  const t = useTranslations("admin");
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending)
    return (
      <p role="status" className="text-muted">
        {t("loading")}
      </p>
    );
  return null;
}
