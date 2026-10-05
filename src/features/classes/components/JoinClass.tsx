"use client";

import { School } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { classIdSchema, useClassAction } from "../hooks";

export function JoinClass({ code }: { code: string }) {
  const t = useTranslations("classes");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const join = useClassAction();
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-xl border border-border bg-surface p-8 text-center shadow-lg">
      <span className="grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary">
        <School className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold">{t("joinPageTitle", { code })}</h1>
      <p className="text-muted">{t("joinPageBody")}</p>
      <Button
        size="lg"
        disabled={join.isPending || join.isSuccess}
        onClick={() =>
          join.mutate(
            { path: "/join", method: "POST", body: { code } },
            {
              onSuccess: (result) => {
                toast(t("joined"));
                router.replace(`/classes/${classIdSchema.parse(result.data).id}`);
              },
              onError: (error) => toast(errorMessage(error), "error"),
            },
          )
        }
      >
        {t("join")}
      </Button>
    </section>
  );
}
