"use client";

import {
  Brain,
  Copy,
  Ellipsis,
  Gamepad2,
  Layers,
  ListChecks,
  Pencil,
  Puzzle,
  Trash,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/features/auth/hooks";
import { cn } from "@/lib/cn";
import type { StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { useDeleteSet, useDuplicateSet } from "../hooks";
import { AiSetTools } from "@/features/ai-generate/components/AiSetTools";
import { CardList } from "./CardList";
import { ProgressPanel } from "./ProgressPanel";
import { SetPreview } from "./SetPreview";
import { SourceBadge } from "./SetCard";

interface ModeTile {
  key: "flashcards" | "test" | "match" | "games" | "learn";
  href: (id: string) => string;
  icon: LucideIcon;
  tone: string;
}

const MODES: readonly ModeTile[] = [
  {
    key: "learn",
    href: (id) => `/study/${id}/learn`,
    icon: Brain,
    tone: "bg-primary-soft text-primary",
  },
  {
    key: "flashcards",
    href: (id) => `/study/${id}/flashcards`,
    icon: Layers,
    tone: "bg-primary-soft text-primary",
  },
  {
    key: "test",
    href: (id) => `/study/${id}/test`,
    icon: ListChecks,
    tone: "bg-success-soft text-success",
  },
  {
    key: "match",
    href: (id) => `/study/${id}/games/match`,
    icon: Puzzle,
    tone: "bg-accent-soft text-accent-strong",
  },
  {
    key: "games",
    href: (id) => `/study/${id}/games`,
    icon: Gamepad2,
    tone: "bg-danger-soft text-danger",
  },
];

function SetActions({ set }: { set: StudySet }) {
  const t = useTranslations("set");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const duplicate = useDuplicateSet();
  const remove = useDeleteSet();
  const [confirmOpen, setConfirmOpen] = useState(false);

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
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={() => setConfirmOpen(true)}>
            <Trash aria-hidden />
            {t("deleteSet")}
          </MenuItem>
        </MenuContent>
      </Menu>
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

export function SetOverview({ set }: { set: StudySet }) {
  const t = useTranslations("set");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("contentLanguages");
  const { data: user } = useSession();

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-surface-3 px-2.5 py-0.5 font-bold text-muted">
            {tCommon("cards", { count: set.cards.length })}
          </span>
          <SourceBadge source={set.source} />
          <span className="text-muted">
            {tLang(set.termLang)} → {tLang(set.definitionLang)}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="max-w-3xl text-title font-extrabold text-balance">{set.title}</h1>
          <SetActions set={set} />
        </div>
        {set.description ? <p className="max-w-2xl text-lg text-muted">{set.description}</p> : null}
        {user ? (
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <Avatar name={user.displayName} color={user.avatarColor} size="sm" />
            {t("by", { name: user.displayName })}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="modes-title">
        <h2 id="modes-title" className="sr-only">
          {t("modesTitle")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MODES.map(({ key, href, icon: Icon, tone }) => (
            <li key={key}>
              <Link
                href={href(set.id)}
                className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:flex-row sm:items-center"
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-110",
                    tone,
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold">{t(`modes.${key}.title`)}</span>
                  <span className="block text-sm text-muted">{t(`modes.${key}.body`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label={t("preview")}>
          <SetPreview set={set} />
        </section>
        <ProgressPanel set={set} />
      </div>

      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? <AiSetTools set={set} /> : null}
      <CardList set={set} />
    </div>
  );
}
