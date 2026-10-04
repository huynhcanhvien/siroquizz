"use client";

import { Brain, ChevronDown, Gamepad2, Layers, ListChecks, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";

export type StudyMode = "flashcards" | "test" | "games" | "learn";

const MODE_ICON = { learn: Brain, flashcards: Layers, test: ListChecks, games: Gamepad2 } as const;
const MODES: readonly StudyMode[] = ["learn", "flashcards", "test", "games"];

interface StudyTopBarProps {
  setId: string;
  setTitle: string;
  mode: StudyMode;
  center?: ReactNode;
}

export function StudyTopBar({ setId, setTitle, mode, center }: StudyTopBarProps) {
  const t = useTranslations("study");
  const CurrentIcon = MODE_ICON[mode];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              aria-label={`${t("modeLabel")}: ${t(`modes.${mode}`)}`}
            >
              <CurrentIcon className="size-4.5 text-primary" aria-hidden />
              <span className="hidden sm:inline">{t(`modes.${mode}`)}</span>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            {MODES.map((item) => {
              const Icon = MODE_ICON[item];
              return (
                <MenuItem key={item} asChild>
                  <Link
                    href={`/study/${setId}/${item}`}
                    aria-current={item === mode ? "page" : undefined}
                  >
                    <Icon aria-hidden />
                    {t(`modes.${item}`)}
                  </Link>
                </MenuItem>
              );
            })}
          </MenuContent>
        </Menu>
        <div className="min-w-0 text-center">
          {center ?? <p className="truncate font-bold">{setTitle}</p>}
        </div>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="justify-self-end"
          aria-label={t("exit")}
        >
          <Link href={`/sets/${setId}`}>
            <X className="size-5" aria-hidden />
          </Link>
        </Button>
      </div>
    </header>
  );
}
