"use client";

import { Copy, Ellipsis, FolderPlus, Pencil, Trash, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import type { StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { useDeleteSet, useDuplicateSet } from "../hooks";
import { ShareDialog } from "@/features/community/components/ShareDialog";
import { AddToFolderDialog } from "@/features/folders/components/AddToFolderDialog";
import { CollaboratorsDialog } from "../collab/components/CollaboratorsDialog";

const isHttp = process.env.NEXT_PUBLIC_DATA_SOURCE === "http";

/** The owner's toolbar on a set page: share, edit, and the overflow menu. */
export function SetActions({ set }: { set: StudySet }) {
  const t = useTranslations("set");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const duplicate = useDuplicateSet();
  const remove = useDeleteSet();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const tFolders = useTranslations("folders");
  const tCollab = useTranslations("collab");

  const handleDuplicate = () =>
    duplicate.mutate(
      { id: set.id, title: t("copyTitle", { title: set.title }) },
      {
        onSuccess: (copy) => {
          toast(t("duplicated"));
          router.push(`/sets/${copy.id}`);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );

  const handleDelete = () =>
    remove.mutate(set.id, {
      onSuccess: () => {
        toast(t("deleted"));
        router.replace("/library");
      },
      onError: (error) => toast(errorMessage(error), "error"),
    });

  return (
    <div className="flex items-center gap-2">
      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? <ShareDialog set={set} /> : null}
      <Button asChild variant="secondary" size="sm">
        <Link href={`/sets/${set.id}/edit`}>
          <Pencil className="size-4" aria-hidden />
          {tCommon("edit")}
        </Link>
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" className="size-9" aria-label={t("actions")}>
            <Ellipsis className="size-4" aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={handleDuplicate}>
            <Copy aria-hidden />
            {t("duplicate")}
          </MenuItem>
          {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? (
            <MenuItem onSelect={() => setFolderOpen(true)}>
              <FolderPlus aria-hidden />
              {tFolders("addToFolder")}
            </MenuItem>
          ) : null}
          {isHttp ? (
            <MenuItem onSelect={() => setCollaboratorsOpen(true)}>
              <Users aria-hidden />
              {tCollab("collaborators")}
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={() => setConfirmOpen(true)}>
            <Trash aria-hidden />
            {t("deleteSet")}
          </MenuItem>
        </MenuContent>
      </Menu>
      {collaboratorsOpen ? (
        <CollaboratorsDialog
          setId={set.id}
          acceptsContributions={set.access?.acceptsContributions ?? true}
          open={collaboratorsOpen}
          onOpenChange={setCollaboratorsOpen}
        />
      ) : null}
      {folderOpen ? (
        <AddToFolderDialog setId={set.id} open={folderOpen} onOpenChange={setFolderOpen} />
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("deleteTitle")}
        description={t("deleteBody", { title: set.title })}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleDelete}
        loading={remove.isPending}
      />
    </div>
  );
}
