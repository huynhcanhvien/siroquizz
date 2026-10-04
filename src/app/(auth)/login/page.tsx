import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuestOnly } from "@/features/auth/components/AuthGuard";
import { LoginForm } from "@/features/auth/components/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

export default function Page() {
  return (
    <GuestOnly>
      <LoginForm />
    </GuestOnly>
  );
}
