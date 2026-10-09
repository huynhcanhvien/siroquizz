"use client";

import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { Side } from "@/lib/types";

export function PhoneticSideButton({
  side,
  onSideChange,
}: {
  side: Side;
  onSideChange: (side: Side) => void;
}) {
  const t = useTranslations("set");
  return (
    <Button
      variant="secondary"
      size="sm"
      className="h-auto min-h-9 max-w-full py-2 whitespace-normal"
      onClick={() => onSideChange(side === "term" ? "definition" : "term")}
    >
      <ArrowLeftRight className="size-4" aria-hidden />
      {t(side === "term" ? "phoneticUnderTerm" : "phoneticUnderDefinition")}
    </Button>
  );
}
