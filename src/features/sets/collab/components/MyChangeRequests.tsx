"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useChangeRequests, useWithdrawChangeRequest } from "../hooks";
import type { ChangeRequestStatus } from "../schemas";

const STATUS_TONE: Record<ChangeRequestStatus, "neutral" | "primary" | "success" | "danger"> = {
  pending: "primary",
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

/** A viewer's own suggestions on this set, with their status and a way to withdraw. */
export function MyChangeRequests({ setId }: { setId: string }) {
  const t = useTranslations("collab");
  const format = useFormatter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const requests = useChangeRequests(setId, "all");
  const withdraw = useWithdrawChangeRequest(setId);
  if (!requests.data?.length) return null;
  return (
    <section aria-labelledby="my-change-requests" className="flex flex-col gap-3">
      <h2 id="my-change-requests" className="text-xl font-bold">
        {t("mine")}
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {requests.data.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <Badge tone={STATUS_TONE[request.status]}>{t(`status.${request.status}`)}</Badge>
            <span>{t("opCount", { count: request.opCount })}</span>
            <span className="text-muted">
              {format.dateTime(new Date(request.createdAt), { dateStyle: "medium" })}
            </span>
            {request.reviewNote ? <span className="italic">“{request.reviewNote}”</span> : null}
            {request.status === "pending" ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={withdraw.isPending}
                onClick={() =>
                  withdraw.mutate(request.id, {
                    onSuccess: () => toast(t("withdrawn")),
                    onError: (error) => toast(errorMessage(error), "error"),
                  })
                }
              >
                {t("withdraw")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
