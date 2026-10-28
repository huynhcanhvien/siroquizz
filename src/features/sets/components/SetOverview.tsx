"use client";

import { Brain, Gamepad2, Layers, ListChecks, Puzzle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { useSession } from "@/features/auth/hooks";
import { cn } from "@/lib/cn";
import type { SetAccess, StudySet } from "@/lib/types";
import { useSetPhoneticSide } from "../use-set-phonetic-side";
import { AiSetTools } from "@/features/ai-generate/components/AiSetTools";
import { ChangeRequestsPanel } from "../collab/components/ChangeRequestsPanel";
import { MyChangeRequests } from "../collab/components/MyChangeRequests";
import { SharedInBadge, ViewerActions } from "../collab/components/ViewerActions";
import { CardList } from "./CardList";
import { SetActions } from "./SetActions";
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

export function SetOverview({ set }: { set: StudySet }) {
  const t = useTranslations("set");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("contentLanguages");
  const tCommunity = useTranslations("community");
  const { data: user } = useSession();
  const { phoneticSide, setPhoneticSide } = useSetPhoneticSide(set.id);
  // Browser-stored sets carry no access summary: whoever sees them owns them.
  const fallbackOwner = !user || user.id === set.ownerId;
  const access: SetAccess = set.access ?? {
    isOwner: fallbackOwner,
    canEdit: fallbackOwner,
    acceptsContributions: true,
  };
  const { isOwner } = access;
  const isHttp = process.env.NEXT_PUBLIC_DATA_SOURCE === "http";

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
          {isOwner ? (
            <SetActions set={set} />
          ) : set.access ? (
            <ViewerActions set={set} access={set.access} />
          ) : null}
        </div>
        {access.sharedIn ? <SharedInBadge sharedIn={access.sharedIn} /> : null}
        {set.description ? <p className="max-w-2xl text-lg text-muted">{set.description}</p> : null}
        {set.copiedFrom ? (
          <p className="text-sm text-muted">
            {set.copiedFrom.slug ? (
              <Link
                href={`/s/${set.copiedFrom.slug}`}
                className="underline-offset-2 hover:underline"
              >
                {tCommunity("copiedFrom", {
                  title: set.copiedFrom.title,
                  author: set.copiedFrom.authorName,
                })}
              </Link>
            ) : (
              tCommunity("copiedFrom", {
                title: set.copiedFrom.title,
                author: set.copiedFrom.authorName,
              })
            )}
          </p>
        ) : null}
        {user && isOwner ? (
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
          <SetPreview set={set} phoneticSide={phoneticSide} />
        </section>
        <ProgressPanel set={set} />
      </div>

      {isHttp && isOwner ? <ChangeRequestsPanel setId={set.id} /> : null}
      {isHttp && set.access && !isOwner ? <MyChangeRequests setId={set.id} /> : null}
      {isHttp && isOwner ? <AiSetTools set={set} /> : null}
      <CardList
        set={set}
        editable={access.canEdit}
        phoneticSide={phoneticSide}
        onPhoneticSideChange={setPhoneticSide}
      />
    </div>
  );
}
