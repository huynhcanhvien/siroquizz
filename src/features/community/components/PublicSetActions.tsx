"use client";

import { useMutation } from "@tanstack/react-query";
import { CopyPlus, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";
import { ReportDialog } from "./ReportDialog";

const client = createHttpClient();

/** Copy-to-library and report actions on a shared set's page. */
export function PublicSetActions({
  slug,
  setId,
  signedIn,
  isOwner,
}: {
  slug: string;
  setId: string;
  signedIn: boolean;
  isOwner: boolean;
}) {
  const t = useTranslations("community");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const copy = useMutation({
    mutationFn: async () =>
      (
        await client.request(`/api/v1/public/${slug}/copy`, z.object({ id: z.uuid() }), {
          method: "POST",
          body: {},
        })
      ).data,
    onSuccess: ({ id }) => {
      toast(t("copied"));
      router.push(`/sets/${id}`);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (!signedIn)
    return (
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(`/s/${slug}`)}`}>
          <LogIn className="size-4" aria-hidden />
          {t("signInToCopy")}
        </Link>
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isOwner ? (
        <Button asChild variant="secondary">
          <Link href={`/sets/${setId}`}>{t("openSet")}</Link>
        </Button>
      ) : null}
      <Button onClick={() => copy.mutate()} disabled={copy.isPending || copy.isSuccess}>
        <CopyPlus className="size-4" aria-hidden />
        {t("copyToLibrary")}
      </Button>
      {isOwner ? null : <ReportDialog setId={setId} />}
    </div>
  );
}
