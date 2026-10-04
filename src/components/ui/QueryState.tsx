"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/use-messages";
import { Button } from "./Button";

export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations("common");
  const errorMessage = useErrorMessage();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-6 py-10 text-center">
      <CircleAlert className="size-8 text-danger" aria-hidden />
      <p className="font-semibold">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
