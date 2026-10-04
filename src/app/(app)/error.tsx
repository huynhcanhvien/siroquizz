"use client";

import { useEffect } from "react";
import { QueryError } from "@/components/ui/QueryState";

export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Route render failed", error);
  }, [error]);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <QueryError error={error} onRetry={retry} />
    </div>
  );
}
