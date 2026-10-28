"use client";

import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ShareToClassPanel } from "./ShareToClassPanel";

/** The folder owner's "Share" button: classes only (folders have no public link). */
export function ShareFolderDialog({ folderId }: { folderId: string }) {
  const t = useTranslations("folders");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="size-4" aria-hidden />
        {t("share")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("shareTitle")}>
        {open ? <ShareToClassPanel itemType="folder" itemId={folderId} /> : null}
      </Dialog>
    </>
  );
}
