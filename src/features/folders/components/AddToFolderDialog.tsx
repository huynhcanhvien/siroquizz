"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Checkbox } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useFolderMembership, useFolders, useFoldersOfSet } from "../hooks";
import { NewFolderForm } from "./FoldersView";

/** Checklist of the person's folders for one set; ticking adds, unticking removes. */
export function AddToFolderDialog({
  setId,
  open,
  onOpenChange,
}: {
  setId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("folders");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const folders = useFolders();
  const memberOf = useFoldersOfSet(setId, open);
  const membership = useFolderMembership();
  // Ticks change at once; a failed request puts the box back.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const isMember = (folderId: string) =>
    pending[folderId] ?? memberOf.data?.includes(folderId) ?? false;
  const toggle = (folderId: string, member: boolean) => {
    setPending((current) => ({ ...current, [folderId]: member }));
    membership.mutate(
      { folderId, setId, member },
      {
        onSuccess: () => toast(t("updated")),
        onError: (error) => {
          setPending(({ [folderId]: _reverted, ...rest }) => rest);
          toast(errorMessage(error), "error");
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("addTitle")}>
      <div className="flex flex-col gap-4">
        {folders.data?.length ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {folders.data.map((folder) => (
              <li key={folder.id}>
                <Checkbox
                  label={folder.name}
                  checked={isMember(folder.id)}
                  disabled={!memberOf.data}
                  onChange={(event) => toggle(folder.id, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("empty")}</p>
        )}
        <NewFolderForm onCreated={(folderId) => toggle(folderId, true)} />
      </div>
    </Dialog>
  );
}
