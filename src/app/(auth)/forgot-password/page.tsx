import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuestOnly } from "@/features/auth/components/AuthGuard";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("forgotTitle") };
}

export default function Page() {
  return (
    <GuestOnly>
      <ForgotPasswordForm />
    </GuestOnly>
  );
}
