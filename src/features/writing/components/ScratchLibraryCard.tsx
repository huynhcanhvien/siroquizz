"use client";

import { BookmarkPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useScratchCards } from "../hooks";
import { ScratchDrawer } from "./ScratchDrawer";

/** "Scratch cards (n)" in the library header; opens the drawer to turn them into a set. */
export function ScratchLibraryCard() {
  const t = useTranslations("library");
  const cards = useScratchCards();
  const [open, setOpen] = useState(false);
  if (!cards.data?.length) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <BookmarkPlus className="size-4" aria-hidden />
        {t("scratchCards", { count: cards.data.length })}
      </Button>
      <ScratchDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
