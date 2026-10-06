"use client";

import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Label, Textarea } from "@/components/ui/fields";
import { useToast } from "@/components/ui/Toast";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";

const client = createHttpClient();
const REASONS = ["spam", "inappropriate", "copyright", "other"] as const;
type Reason = (typeof REASONS)[number];

/** Lets a signed-in viewer report a shared set to the moderators. */
export function ReportDialog({ setId }: { setId: string }) {
  const t = useTranslations("community");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("spam");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () =>
      client.request("/api/v1/reports", z.null(), {
        method: "POST",
        body: { targetType: "set", targetId: setId, reason, note },
      }),
    onSuccess: () => {
      setOpen(false);
      setNote("");
      toast(t("reported"));
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flag className="size-4" aria-hidden />
        {t("report")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("reportTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending}>
              {t("reportSend")}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t("reportReason")}</legend>
          {REASONS.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
            >
              <input
                type="radio"
                name="report-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="accent-[var(--primary)]"
              />
              {t(`reasons.${value}`)}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor={noteId}>{t("reportNote")}</Label>
          <Textarea
            id={noteId}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
