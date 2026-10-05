import { Compass } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/misc";

/** Header for pages guests can open (shared sets, Explore, profiles). */
export async function PublicHeader({
  signedIn,
  returnTo,
}: {
  signedIn: boolean;
  returnTo: string;
}) {
  const t = await getTranslations("community");
  const tNav = await getTranslations("nav");
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href={signedIn ? "/home" : "/"} aria-label="SiroQuizz">
          <Logo wordmarkClassName="hidden min-[400px]:inline" />
        </Link>
        <nav aria-label={tNav("explore")} className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href="/explore">
              <Compass className="size-4" aria-hidden />
              {tNav("explore")}
            </Link>
          </Button>
          <LanguageSwitcher compact />
          <ThemeToggle />
          <Button asChild size="sm" variant={signedIn ? "secondary" : "primary"}>
            <Link href={signedIn ? "/library" : `/login?next=${encodeURIComponent(returnTo)}`}>
              {signedIn ? t("openLibrary") : t("signIn")}
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
