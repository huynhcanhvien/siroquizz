"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/Button";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/Menu";
import { useHydrated } from "@/lib/client-hooks";

export const THEME_OPTIONS = ["light", "dark", "system"] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];
export const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const Icon = hydrated && resolvedTheme === "dark" ? Moon : Sun;

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")}>
          <Icon className="size-4.5" aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t("label")}</MenuLabel>
        <MenuRadioGroup value={hydrated ? theme : undefined} onValueChange={setTheme}>
          {THEME_OPTIONS.map((option) => {
            const OptionIcon = THEME_ICONS[option];
            return (
              <MenuRadioItem key={option} value={option}>
                <OptionIcon className="text-muted" aria-hidden />
                {t(option)}
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
