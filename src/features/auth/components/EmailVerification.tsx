"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/fields";
import { useErrorMessage } from "@/lib/use-messages";
import { useSession } from "../hooks";
import { authRequest } from "../http-repository";
import { AuthHeading, FormError } from "./AuthCard";
export function EmailVerification() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const router = useRouter();
  const current = useSession();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState("");
  const resend = useMutation({
    mutationFn: () =>
      authRequest("send-verification-email", { email, callbackURL: "/verify-email" }),
  });
  useEffect(() => {
    if (current.data) router.replace("/home");
  }, [current.data, router]);
  return (
    <>
      <AuthHeading title={t("verifyTitle")} subtitle={t("verifyBody")} />
      {params.get("error") ? <FormError message={t("invalidLink")} /> : null}
      {resend.isSuccess ? <p role="status">{t("verificationResent")}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          resend.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <FormError message={resend.isError ? errorMessage(resend.error) : null} />
        <Field label={t("email")}>
          {(control) => (
            <Input
              {...control}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          )}
        </Field>
        <Button type="submit" loading={resend.isPending}>
          {t("resendVerification")}
        </Button>
      </form>
      <Link href="/login" className="mt-6 inline-block font-semibold text-primary-text">
        {t("backToLogin")}
      </Link>
    </>
  );
}
