"use client";

import { Folder } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type DragEvent } from "react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useErrorMessage } from "@/lib/use-messages";
import { useFolderMembership, useFolders } from "../hooks";

/** Drag payload type carrying a set id from a library card to a folder chip. */
export const SET_DRAG_TYPE = "application/x-siroquizz-set";
export const dragSet = (setId: string) => (event: DragEvent) => {
  event.dataTransfer.setData(SET_DRAG_TYPE, setId);
  event.dataTransfer.effectAllowed = "copy";
};

/**
 * Folder chips above the library: drop a set card on one to file it there. The set's "⋯ → Add to
 * folder" menu is the keyboard and touch alternative.
 */
export function FolderDropBar() {
  const t = useTranslations("folders");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const folders = useFolders();
  const membership = useFolderMembership();
  const [over, setOver] = useState<string | null>(null);
  if (!folders.data?.length) return null;
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(SET_DRAG_TYPE);
  return (
    <nav
      aria-label={t("title")}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-bold">{t("title")}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {folders.data.map((folder) => (
          <li key={folder.id}>
            <Link
              href={`/folders/${folder.id}`}
              onDragOver={(event) => {
                if (!accepts(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setOver(folder.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                if (!accepts(event)) return;
                event.preventDefault();
                setOver(null);
                membership.mutate(
                  {
                    folderId: folder.id,
                    setId: event.dataTransfer.getData(SET_DRAG_TYPE),
                    member: true,
                  },
                  {
                    onSuccess: () => toast(t("updated")),
                    onError: (error) => toast(errorMessage(error), "error"),
                  },
                );
              }}
              aria-label={over === folder.id ? t("dropHere", { name: folder.name }) : undefined}
              className={cn(
                "flex h-full min-h-16 items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 font-semibold transition-[transform,background-color,border-color] hover:border-primary",
                over === folder.id && "scale-105 border-primary bg-primary-soft text-primary-text",
              )}
            >
              <Folder className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block break-words">{folder.name}</span>
                <span className="block text-sm font-normal text-muted">
                  {t("sets", { count: folder.setCount })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {t("dragHint")} {t("multipleFoldersHint")}
      </p>
    </nav>
  );
}
