"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/fields";
import { Avatar, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useChangeRequest, useChangeRequests, useReviewChangeRequest } from "../hooks";
import type { ChangeRequestSummary } from "../schemas";
import { ChangeRequestDiff } from "./ChangeRequestDiff";

function ReviewItem({ setId, summary }: { setId: string; summary: ChangeRequestSummary }) {
  const t = useTranslations("collab");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const detail = useChangeRequest(summary.id);
  const review = useReviewChangeRequest(setId);
  const noteId = useId();
  const [reviewNote, setReviewNote] = useState("");
  // The item leaves the pending list once decided: mutateAsync still reports the outcome.
  const decide = (action: "approve" | "reject") =>
    review.mutateAsync({ id: summary.id, action, reviewNote }).then(
      () => toast(t(action === "approve" ? "approved" : "rejected")),
      (error: unknown) => toast(errorMessage(error), "error"),
    );
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar name={summary.author.name} color={summary.author.avatarColor} size="sm" />
        <span className="font-semibold">{t("by", { name: summary.author.name })}</span>
        <span className="text-muted">· {t("opCount", { count: summary.opCount })}</span>
      </p>
      {summary.note ? <p className="text-sm italic">“{summary.note}”</p> : null}
      {detail.data ? <ChangeRequestDiff request={detail.data} /> : null}
      {detail.isPending ? <Skeleton className="h-16" /> : null}
      {detail.isError ? <QueryError error={detail.error} onRetry={() => detail.refetch()} /> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={noteId}>{t("reviewNote")}</Label>
        <Textarea
          id={noteId}
          maxLength={500}
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          className="min-h-16"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={review.isPending} onClick={() => decide("approve")}>
          <Check className="size-4" aria-hidden />
          {t("approve")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={review.isPending}
          onClick={() => decide("reject")}
        >
          <X className="size-4" aria-hidden />
          {t("reject")}
        </Button>
      </div>
    </li>
  );
}

/** The owner's review queue on the set page; hidden while nothing waits. */
export function ChangeRequestsPanel({ setId }: { setId: string }) {
  const t = useTranslations("collab");
  const requests = useChangeRequests(setId, "pending");
  if (requests.isError)
    return <QueryError error={requests.error} onRetry={() => requests.refetch()} />;
  if (!requests.data?.length) return null;
  return (
    <section
      id="change-requests"
      aria-labelledby="change-requests-title"
      className="flex flex-col gap-3"
    >
      <h2 id="change-requests-title" className="text-xl font-bold">
        {t("pendingTitle", { count: requests.data.length })}
      </h2>
      <ul className="flex flex-col gap-3">
        {requests.data.map((summary) => (
          <ReviewItem key={summary.id} setId={setId} summary={summary} />
        ))}
      </ul>
    </section>
  );
}
