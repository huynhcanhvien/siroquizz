import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuestOnly } from "@/features/auth/components/AuthGuard";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("registerTitle") };
}

export default function Page() {
  return (
    <GuestOnly>
      <RegisterForm />
    </GuestOnly>
  );
}
