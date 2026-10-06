"use client";

import { CalendarCheck, Folder, Layers, ListChecks, Pencil, Trash, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/fields";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useDeleteFolder, useFolder, useFolderMembership, useRenameFolder } from "../hooks";
import { FOLDER_NAME_MAX, type FolderDetail } from "../schemas";

function RenameDialog({ folder }: { folder: FolderDetail }) {
  const t = useTranslations("folders");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const rename = useRenameFolder(folder.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(folder.name);
  const submit = () =>
    rename.mutate(name.trim(), {
      onSuccess: () => {
        setOpen(false);
        toast(t("renamed"));
      },
      onError: (error) => toast(errorMessage(error), "error"),
    });
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" aria-hidden />
        {t("rename")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("renameTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={submit} disabled={!name.trim() || rename.isPending}>
              {t("save")}
            </Button>
          </>
        }
      >
        <Input
          aria-label={t("namePlaceholder")}
          value={name}
          maxLength={FOLDER_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) submit();
          }}
        />
      </Dialog>
    </>
  );
}

function DeleteFolder({ folder }: { folder: FolderDetail }) {
  const t = useTranslations("folders");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const remove = useDeleteFolder();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash className="size-4" aria-hidden />
        {t("delete")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteTitle")}
        description={t("deleteBody", { name: folder.name })}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={tCommon("cancel")}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(folder.id, {
            onSuccess: () => {
              toast(t("deleted"));
              router.replace("/folders");
            },
            onError: (error) => toast(errorMessage(error), "error"),
          })
        }
      />
    </>
  );
}

const STUDY = [
  { key: "studyFlashcards", href: (id: string) => `/study/folder/${id}/flashcards`, icon: Layers },
  { key: "studyTest", href: (id: string) => `/study/folder/${id}/test`, icon: ListChecks },
  { key: "studyReview", href: (id: string) => `/review?folder=${id}`, icon: CalendarCheck },
] as const;

export function FolderView({ id }: { id: string }) {
  const t = useTranslations("folders");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const folder = useFolder(id);
  const membership = useFolderMembership();

  if (folder.error)
    return <QueryError error={folder.error} onRetry={() => void folder.refetch()} />;
  if (!folder.data) return <Skeleton className="h-64" />;
  const data = folder.data;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
            <Folder className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-title font-extrabold text-balance">{data.name}</h1>
            <p className="text-muted">{t("sets", { count: data.sets.length })}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <RenameDialog key={data.name} folder={data} />
          <DeleteFolder folder={data} />
        </div>
      </header>

      {data.sets.length ? (
        <section aria-labelledby="folder-study" className="flex flex-col gap-3">
          <h2 id="folder-study" className="text-xl font-bold">
            {t("studyTitle")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {STUDY.map(({ key, href, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={href(data.id)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 font-bold shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{t("practiceNote")}</p>
        </section>
      ) : null}

      <section aria-labelledby="folder-sets" className="flex flex-col gap-3">
        <h2 id="folder-sets" className="text-xl font-bold">
          {t("setsTitle")}
        </h2>
        {data.sets.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {data.sets.map((set) => (
              <li key={set.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <Link href={`/sets/${set.id}`} className="min-w-0 font-semibold hover:underline">
                  <span className="block truncate">{set.title}</span>
                  <span className="text-sm font-normal text-muted">
                    {tCommon("cards", { count: set.cardCount })}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeSet", { title: set.title })}
                  disabled={membership.isPending}
                  onClick={() =>
                    membership.mutate(
                      { folderId: data.id, setId: set.id, member: false },
                      {
                        onSuccess: () => toast(t("removed")),
                        onError: (error) => toast(errorMessage(error), "error"),
                      },
                    )
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Folder className="size-8" aria-hidden />}
            title={data.name}
            body={t("emptyFolder")}
          />
        )}
      </section>
    </div>
  );
}
