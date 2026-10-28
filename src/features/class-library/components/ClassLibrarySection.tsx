"use client";

import { Copy, Folder, Layers, Share2, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useDuplicateSet } from "@/features/sets/hooks";
import { useErrorMessage } from "@/lib/use-messages";
import { useClassLibrary, useUnshare } from "../hooks";
import { libraryItemHref, type ClassLibraryItem } from "../schemas";
import { ShareItemToClassDialog } from "./ShareItemToClassDialog";

function LibraryRow({ classId, item }: { classId: string; item: ClassLibraryItem }) {
  const t = useTranslations("classes.library");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const unshare = useUnshare();
  const duplicate = useDuplicateSet();
  const onError = (error: unknown) => toast(errorMessage(error), "error");
  const Icon = item.itemType === "set" ? Layers : Folder;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon
          className="size-5"
          aria-label={t(item.itemType === "set" ? "setItem" : "folderItem")}
        />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={libraryItemHref(item)} className="font-bold underline-offset-2 hover:underline">
          {item.title}
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Avatar name={item.sharedBy.name} color={item.sharedBy.avatarColor} size="sm" />
          {t("sharedBy", { name: item.sharedBy.name })}
          <span aria-hidden>·</span>
          {item.cardCount !== null
            ? tCommon("cards", { count: item.cardCount })
            : t("setCount", { count: item.setCount ?? 0 })}
          <Badge tone={item.audience === "class" ? "primary" : "accent"}>
            {t(item.audience === "class" ? "audienceClass" : "audienceTeachers")}
          </Badge>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={libraryItemHref(item)}>{t("open")}</Link>
        </Button>
        {item.itemType === "set" ? (
          <Button
            variant="ghost"
            size="sm"
            loading={duplicate.isPending}
            onClick={() =>
              duplicate.mutate(
                { id: item.itemId, title: item.title },
                { onSuccess: () => toast(t("copied")), onError },
              )
            }
          >
            <Copy className="size-4" aria-hidden />
            {t("copy")}
          </Button>
        ) : null}
        {item.canRemove ? (
          <Button
            variant="ghost"
            size="sm"
            loading={unshare.isPending}
            onClick={() =>
              unshare
                .mutateAsync({ classId, libraryItemId: item.id })
                .then(() => toast(t("removed")), onError)
            }
          >
            <X className="size-4" aria-hidden />
            {t("remove")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** "Class library" on a class page: what members shared, and a button to share one's own. */
export function ClassLibrarySection({ classId }: { classId: string }) {
  const t = useTranslations("classes.library");
  const library = useClassLibrary(classId);
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="class-library"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="class-library" className="text-lg font-bold">
          {t("title")}
        </h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Share2 className="size-4" aria-hidden />
          {t("share")}
        </Button>
      </div>
      {library.isPending ? <Skeleton className="h-20" /> : null}
      {library.isError ? (
        <QueryError error={library.error} onRetry={() => library.refetch()} />
      ) : null}
      {library.data?.length === 0 ? <p className="text-muted">{t("empty")}</p> : null}
      {library.data?.length ? (
        <ul className="divide-y divide-border">
          {library.data.map((item) => (
            <LibraryRow key={item.id} classId={classId} item={item} />
          ))}
        </ul>
      ) : null}
      {open ? (
        <ShareItemToClassDialog classId={classId} open={open} onOpenChange={setOpen} />
      ) : null}
    </section>
  );
}
