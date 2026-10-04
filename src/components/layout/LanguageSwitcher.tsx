"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/Menu";
import { isLocale, LOCALE_LABELS, LOCALES } from "@/i18n/config";
import { useChangeLocale } from "@/i18n/use-change-locale";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const { changeLocale, isPending } = useChangeLocale();

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          aria-label={`${t("label")}: ${LOCALE_LABELS[locale]}`}
          loading={isPending}
        >
          {isPending ? null : <Languages className="size-4.5" aria-hidden />}
          {compact ? null : <span>{LOCALE_LABELS[locale]}</span>}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t("label")}</MenuLabel>
        <MenuRadioGroup value={locale} onValueChange={(value) => isLocale(value) && changeLocale(value)}>
          {LOCALES.map((item) => (
            <MenuRadioItem key={item} value={item} lang={item}>
              {LOCALE_LABELS[item]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
