import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/ui/misc";

async function AuthAside() {
  const t = await getTranslations("auth");
  return (
    <aside className="relative hidden overflow-hidden bg-primary p-12 text-on-primary lg:flex lg:flex-col">
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [background-image:radial-gradient(white_1px,transparent_1.2px)] [background-size:22px_22px]"
      />
      <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full bg-accent/40 blur-3xl" />
      <div className="relative mt-auto mb-auto">
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute inset-0 translate-x-5 translate-y-5 rotate-6 rounded-xl bg-accent" />
          <div className="absolute inset-0 translate-x-2.5 translate-y-2.5 rotate-3 rounded-xl bg-white/30" />
          <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-white text-[oklch(24%_0.045_275)] shadow-lg">
            <span lang={t("sideCardLang")} className="text-6xl font-bold">
              {t("sideCardFront")}
            </span>
            <span className="text-lg text-[oklch(48%_0.035_275)]">{t("sideCardPhonetic")}</span>
            <span className="mt-3 rounded-full bg-[oklch(96%_0.06_88)] px-3 py-1 text-sm font-semibold text-[oklch(30%_0.07_60)]">
              {t("sideCardBack")}
            </span>
          </div>
        </div>
      </div>
      <div className="relative max-w-md">
        <p className="text-3xl font-extrabold tracking-tight">{t("sideTitle")}</p>
        <p className="mt-3 text-lg text-white/85">{t("sideBody")}</p>
      </div>
    </aside>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="rounded-md" aria-label="SiroQuizz">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <Suspense>{children}</Suspense>
          </div>
        </main>
      </div>
      <AuthAside />
    </div>
  );
}
