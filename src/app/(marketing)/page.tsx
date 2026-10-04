import { BookOpenCheck, Gamepad2, Layers, ListChecks, WandSparkles, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/misc";
import { DemoFlashcard } from "@/features/marketing/components/DemoFlashcard";
import { LandingAuthActions } from "@/features/marketing/components/LandingAuthActions";
import { cn } from "@/lib/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

interface FeatureTileProps {
  icon: LucideIcon;
  title: string;
  body: string;
  className?: string;
  iconClassName?: string;
  children?: ReactNode;
}

function FeatureTile({ icon: Icon, title, body, className, iconClassName, children }: FeatureTileProps) {
  return (
    <article className={cn("relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8", className)}>
      <span className={cn("grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary", iconClassName)}>
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="mt-5 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-muted">{body}</p>
      {children}
    </article>
  );
}

function MiniQuestionTypes({ labels }: { labels: string[] }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {labels.map((label) => (
        <li key={label} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm font-semibold">
          {label}
        </li>
      ))}
    </ul>
  );
}

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tTest = await getTranslations("test.type");
  const tGames = await getTranslations("games");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Logo wordmarkClassName="hidden min-[400px]:inline" />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher compact />
            <ThemeToggle />
            <LandingAuthActions />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 overflow-x-clip">
        <section aria-labelledby="hero-title" className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div className="animate-rise">
            <p className="inline-flex rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-muted shadow-sm">
              {t("eyebrow")}
            </p>
            <h1 id="hero-title" className="mt-6 text-display font-extrabold text-balance">
              {t.rich("heroTitle", { mark: (chunks) => <span className="marker-highlight">{chunks}</span> })}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{t("heroSubtitle")}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/register">{t("ctaPrimary")}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">{t("ctaSecondary")}</Link>
              </Button>
            </div>
          </div>
          <DemoFlashcard />
        </section>

        <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <h2 id="features-title" className="max-w-xl text-title font-extrabold">
            {t("featuresTitle")}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            <FeatureTile
              icon={WandSparkles}
              title={t("features.ai.title")}
              body={t("features.ai.body")}
              className="border-accent/50 bg-accent-soft md:col-span-4"
              iconClassName="bg-accent text-on-accent"
            >
              <div aria-hidden className="absolute -right-10 -bottom-10 size-48 rounded-full bg-accent/40 blur-2xl" />
            </FeatureTile>
            <FeatureTile icon={Layers} title={t("features.flashcards.title")} body={t("features.flashcards.body")} className="md:col-span-2" />
            <FeatureTile icon={ListChecks} title={t("features.test.title")} body={t("features.test.body")} className="md:col-span-3">
              <MiniQuestionTypes labels={[tTest("multipleChoice"), tTest("trueFalse"), tTest("written"), tTest("matching")]} />
            </FeatureTile>
            <FeatureTile
              icon={Gamepad2}
              title={t("features.games.title")}
              body={t("features.games.body")}
              className="md:col-span-3"
              iconClassName="bg-success-soft text-success"
            >
              <MiniQuestionTypes
                labels={[tGames("match.title"), tGames("gravity.title"), tGames("memory.title"), tGames("scramble.title")]}
              />
            </FeatureTile>
          </div>
        </section>

        <section aria-labelledby="steps-title" className="border-y border-border bg-surface/70">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="steps-title" className="text-title font-extrabold">
              {t("stepsTitle")}
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {(["one", "two", "three"] as const).map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="text-5xl leading-none font-extrabold text-primary/25">{index + 1}</span>
                  <p className="pt-1 text-lg font-medium">{t(`steps.${step}`)}</p>
                </li>
              ))}
            </ol>
            <p className="mt-12 flex items-center gap-2 text-sm font-medium text-muted">
              <BookOpenCheck className="size-4 text-primary" aria-hidden />
              {t("languagesNote")}
            </p>
          </div>
        </section>

        <section aria-labelledby="final-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-14 text-center text-on-primary shadow-lg sm:px-12">
            <div aria-hidden className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1.2px)] [background-size:22px_22px]" />
            <h2 id="final-title" className="relative text-title font-extrabold">
              {t("finalTitle")}
            </h2>
            <p className="relative mx-auto mt-3 max-w-lg text-white/85">{t("finalBody")}</p>
            <Button asChild size="lg" variant="accent" className="relative mt-8">
              <Link href="/register">{t("ctaPrimary")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">{t("footer")}</footer>
    </div>
  );
}
