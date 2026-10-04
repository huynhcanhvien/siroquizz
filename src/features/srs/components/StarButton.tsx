"use client";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useStars, useStar } from "../hooks";
export function StarButton({ setId, cardId }: { setId: string; cardId: string }) {
  const t = useTranslations("learning"),
    { data = [] } = useStars(setId),
    mutation = useStar(setId),
    { toast } = useToast(),
    errorMessage = useErrorMessage(),
    starred = data.includes(cardId);
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={starred ? t("unstar") : t("star")}
      aria-pressed={starred}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate(
          { cardId, starred: !starred },
          { onError: (error) => toast(errorMessage(error), "error") },
        );
      }}
    >
      <Star className="size-4" fill={starred ? "currentColor" : "none"} aria-hidden />
    </Button>
  );
}
