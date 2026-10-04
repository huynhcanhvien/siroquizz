"use client";

import { Apple, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import { useAuthProviders, useGoogleLogin } from "../hooks";
import { useErrorMessage } from "@/lib/use-messages";

export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-title font-extrabold">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
    >
      {message}
    </p>
  );
}

export function MockNotice() {
  const t = useTranslations("auth");
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http") return null;
  return (
    <p className="mt-8 flex items-start gap-2 text-xs text-subtle">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      {t("mockNotice")}
    </p>
  );
}

const PROVIDERS = [
  {
    id: "google",
    label: "Google",
    mark: <span className="text-lg font-extrabold text-[oklch(55%_0.2_25)]">G</span>,
  },
  { id: "apple", label: "Apple", mark: <Apple className="size-4.5" /> },
] as const;

/** Social sign-in is UI-only in Phase 1. */
export function SocialButtons() {
  const t = useTranslations("auth");
  const { toast } = useToast();
  const providers = useAuthProviders();
  const google = useGoogleLogin();
  const errorMessage = useErrorMessage();
  const http = process.env.NEXT_PUBLIC_DATA_SOURCE === "http";
  if (http && !providers.data?.google) return null;
  return (
    <div>
      <div className="my-6 flex items-center gap-3 text-xs font-semibold text-subtle uppercase">
        <span className="h-px flex-1 bg-border" />
        {t("continueWith")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.filter((provider) => !http || provider.id === "google").map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={google.isPending}
            onClick={() =>
              http
                ? google.mutate(undefined, {
                    onError: (error) => toast(errorMessage(error), "error"),
                  })
                : toast(t("socialComingSoon", { provider: provider.label }), "info")
            }
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-semibold shadow-[0_2px_0_var(--border-strong)] transition hover:bg-surface-2 active:translate-y-[2px] active:shadow-none"
          >
            <span aria-hidden className="grid size-5 place-items-center">
              {provider.mark}
            </span>
            {provider.label}
          </button>
        ))}
      </div>
    </div>
  );
}
