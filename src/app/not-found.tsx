import { Compass } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/misc";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <Logo />
        <span className="grid size-20 place-items-center rounded-3xl bg-accent-soft text-accent-strong">
          <Compass className="size-10" aria-hidden />
        </span>
        <h1 className="text-title font-extrabold">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        <Button asChild size="lg">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
