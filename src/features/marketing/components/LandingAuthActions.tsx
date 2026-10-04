"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/features/auth/hooks";

export function LandingAuthActions() {
  const t = useTranslations("nav");
  const { data: user } = useSession();

  if (user) {
    return (
      <Button asChild size="sm">
        <Link href="/home">
          {t("goToApp")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href="/login">{t("login")}</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">{t("register")}</Link>
      </Button>
    </>
  );
}
