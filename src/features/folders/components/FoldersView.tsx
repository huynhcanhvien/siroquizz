"use client";

import { Folder, FolderPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/fields";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useCreateFolder, useFolders } from "../hooks";
import { FOLDER_NAME_MAX } from "../schemas";

/** Inline "new folder" form; used on the folders page and in the add-to-folder dialog. */
export function NewFolderForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const t = useTranslations("folders");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const create = useCreateFolder();
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        create.mutate(name.trim(), {
          onSuccess: (folder) => {
            setName("");
            toast(t("created"));
            onCreated?.(folder.id);
          },
          onError: (error) => toast(errorMessage(error), "error"),
        });
      }}
    >
      <Input
        aria-label={t("namePlaceholder")}
        placeholder={t("namePlaceholder")}
        value={name}
        maxLength={FOLDER_NAME_MAX}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" disabled={create.isPending || !name.trim()}>
        <FolderPlus className="size-4" aria-hidden />
        {t("create")}
      </Button>
    </form>
  );
}

export function FoldersView() {
  const t = useTranslations("folders");
  const folders = useFolders();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-extrabold">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
      </header>
      <section aria-label={t("newFolder")} className="max-w-xl">
        <NewFolderForm />
      </section>
      {folders.error ? (
        <QueryError error={folders.error} onRetry={() => void folders.refetch()} />
      ) : !folders.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : folders.data.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folders.data.map((folder) => (
            <li key={folder.id}>
              <Link
                href={`/folders/${folder.id}`}
                className="group flex h-full items-center gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-transform group-hover:scale-105">
                  <Folder className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold">{folder.name}</span>
                  <span className="text-sm text-muted">
                    {t("sets", { count: folder.setCount })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Folder className="size-8" aria-hidden />}
          title={t("title")}
          body={t("empty")}
        />
      )}
    </div>
  );
}
