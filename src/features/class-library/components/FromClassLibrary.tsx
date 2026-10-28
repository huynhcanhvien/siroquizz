"use client";

import { Folder, Layers, School } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useMyClassLibrary } from "../hooks";
import { libraryItemHref, type MyClassLibraryItem } from "../schemas";

function FromClassCard({ item }: { item: MyClassLibraryItem }) {
  const t = useTranslations("classes.library");
  const tLibrary = useTranslations("library");
  const tCommon = useTranslations("common");
  const Icon = item.itemType === "set" ? Layers : Folder;
  return (
    <Link
      href={libraryItemHref(item)}
      className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">
          <School aria-hidden />
          {tLibrary("fromClass", { class: item.className })}
        </Badge>
        <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-bold text-muted">
          {item.cardCount !== null
            ? tCommon("cards", { count: item.cardCount })
            : t("setCount", { count: item.setCount ?? 0 })}
        </span>
      </div>
      <span className="flex items-start gap-2 text-lg font-bold">
        <Icon
          className="mt-1 size-4 shrink-0 text-primary"
          aria-label={t(item.itemType === "set" ? "setItem" : "folderItem")}
        />
        <span className="line-clamp-2">{item.title}</span>
      </span>
      <span className="mt-auto flex items-center gap-2 text-sm text-muted">
        <Avatar name={item.sharedBy.name} color={item.sharedBy.avatarColor} size="sm" />
        {t("sharedBy", { name: item.sharedBy.name })}
      </span>
    </Link>
  );
}

/** Library tab "From classes": sets and folders classmates and teachers shared with me. */
export function FromClassLibrary() {
  const t = useTranslations("library");
  const library = useMyClassLibrary();
  if (library.isPending)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  if (library.isError)
    return <QueryError error={library.error} onRetry={() => library.refetch()} />;
  if (!library.data.length)
    return <EmptyState icon={<School aria-hidden />} title={t("fromClassEmpty")} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {library.data.map((item) => (
        <li key={item.id}>
          <FromClassCard item={item} />
        </li>
      ))}
    </ul>
  );
}
