"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { THEME_ICONS, THEME_OPTIONS, type ThemeOption } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/fields";
import { Avatar, avatarBackground, Surface } from "@/components/ui/misc";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { useLogout, useUpdateProfile } from "@/features/auth/hooks";
import {
  AVATAR_COLORS,
  profileSchema,
  type AvatarColor,
  type ProfileInput,
} from "@/features/auth/schemas";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/i18n/config";
import { useChangeLocale } from "@/i18n/use-change-locale";
import { useHydrated } from "@/lib/client-hooks";
import { cn } from "@/lib/cn";
import { getBrowserStorage } from "@/lib/storage";
import type { User } from "@/lib/types";
import { useErrorMessage, useValidationMessage } from "@/lib/use-messages";
import { LearningPreferences } from "@/features/srs/components/LearningPreferences";
import { AccountSecurity } from "@/features/auth/components/AccountSecurity";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface className="p-5 sm:p-7">
      <h2 className="mb-5 text-lg font-bold">{title}</h2>
      {children}
    </Surface>
  );
}

function ProfileSection({ user }: { user: User }) {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const { toast } = useToast();
  const updateProfile = useUpdateProfile();
  const validationMessage = useValidationMessage();
  const errorMessage = useErrorMessage();
  const initialColor = (AVATAR_COLORS as readonly string[]).includes(user.avatarColor)
    ? (user.avatarColor as AvatarColor)
    : "indigo";
  const { register, handleSubmit, control, setValue, formState } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName, avatarColor: initialColor },
  });
  const color = useWatch({ control, name: "avatarColor" });
  const name = useWatch({ control, name: "displayName" });

  const onSubmit = handleSubmit((values) =>
    updateProfile.mutate(values, {
      onSuccess: () => toast(t("profileSaved")),
      onError: (error) => toast(errorMessage(error), "error"),
    }),
  );

  return (
    <Section title={t("profileTitle")}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar name={name || user.displayName} color={color} size="lg" />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("avatarColor")}</legend>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((item) => (
                <label key={item} className="cursor-pointer" title={t(`colors.${item}`)}>
                  <input
                    type="radio"
                    className="peer sr-only"
                    checked={color === item}
                    onChange={() => setValue("avatarColor", item, { shouldDirty: true })}
                    aria-label={t(`colors.${item}`)}
                  />
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-white ring-offset-2 ring-offset-surface transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] hover:scale-110",
                      avatarBackground(item),
                    )}
                  >
                    {color === item ? <Check className="size-4" aria-hidden /> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <Field
          label={tAuth("displayName")}
          error={validationMessage(formState.errors.displayName?.message)}
        >
          {(control) => <Input {...control} {...register("displayName")} />}
        </Field>
        <Field label={t("email")} hint={t("emailHint")}>
          {(control) => <Input {...control} value={user.email} readOnly disabled />}
        </Field>
        <Button type="submit" className="self-start" loading={updateProfile.isPending}>
          {t("saveProfile")}
        </Button>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const t = useTranslations("settings");
  const tTheme = useTranslations("theme");
  const tLanguage = useTranslations("language");
  const locale = useLocale();
  const { changeLocale } = useChangeLocale();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <Section title={t("appearanceTitle")}>
      <div className="flex flex-col gap-6">
        <SegmentedControl<Locale>
          label={tLanguage("label")}
          value={locale}
          onChange={changeLocale}
          options={LOCALES.map((item) => ({
            value: item,
            label: <span lang={item}>{LOCALE_LABELS[item]}</span>,
          }))}
        />
        <SegmentedControl<ThemeOption>
          label={tTheme("label")}
          value={hydrated ? ((theme as ThemeOption | undefined) ?? "system") : "system"}
          onChange={setTheme}
          options={THEME_OPTIONS.map((item) => {
            const Icon = THEME_ICONS[item];
            return {
              value: item,
              label: tTheme(item),
              icon: <Icon className="size-4" aria-hidden />,
            };
          })}
        />
      </div>
    </Section>
  );
}

function AccountSection({ user }: { user: User }) {
  const t = useTranslations("settings");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clearAllData = () => {
    getBrowserStorage().clearAll();
    queryClient.clear();
    router.replace("/");
  };

  return (
    <>
      <Section title={t("accountTitle")}>
        <p className="text-muted">
          {t("memberSince", {
            date: format.dateTime(new Date(user.createdAt), { dateStyle: "long" }),
          })}
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <LogOut className="size-4" aria-hidden />
          {tNav("logout")}
        </Button>
      </Section>
      {process.env.NEXT_PUBLIC_DATA_SOURCE !== "http" ? (
        <Section title={t("dataTitle")}>
          <p className="text-muted">{t("dataBody")}</p>
          <Button
            variant="ghost"
            className="mt-4 text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash className="size-4" aria-hidden />
            {t("clearData")}
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t("clearDataTitle")}
            description={t("clearDataBody")}
            confirmLabel={t("clearDataConfirm")}
            cancelLabel={tCommon("cancel")}
            onConfirm={clearAllData}
          />
        </Section>
      ) : null}
    </>
  );
}

export function SettingsView({ user }: { user: User }) {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-title font-extrabold">{t("title")}</h1>
      <ProfileSection user={user} />
      <AppearanceSection />
      {process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? <><LearningPreferences/><AccountSecurity /></> : null}
      <AccountSection user={user} />
    </div>
  );
}
