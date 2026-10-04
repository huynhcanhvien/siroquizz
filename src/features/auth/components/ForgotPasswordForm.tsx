"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/fields";
import { useErrorMessage, useValidationMessage } from "@/lib/use-messages";
import { useRequestPasswordReset } from "../hooks";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";
import { AuthHeading, FormError, MockNotice } from "./AuthCard";

function BackToLogin() {
  const t = useTranslations("auth");
  return (
    <Link
      href="/login"
      className="mt-8 inline-flex items-center gap-2 font-semibold text-primary-text hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {t("backToLogin")}
    </Link>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const request = useRequestPasswordReset();
  const validationMessage = useValidationMessage();
  const errorMessage = useErrorMessage();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (request.isSuccess) {
    return (
      <div className="animate-rise">
        <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <AuthHeading
          title={t("forgotSentTitle")}
          subtitle={t("forgotSentBody", { email: getValues("email") })}
        />
        <BackToLogin />
      </div>
    );
  }

  return (
    <>
      <AuthHeading title={t("forgotTitle")} subtitle={t("forgotSubtitle")} />
      <form
        onSubmit={handleSubmit((values) => request.mutate(values.email))}
        noValidate
        className="flex flex-col gap-5"
      >
        <FormError message={request.isError ? errorMessage(request.error) : null} />
        <Field label={t("email")} error={validationMessage(errors.email?.message)}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              {...register("email")}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={request.isPending}>
          {t("submitForgot")}
        </Button>
      </form>
      <BackToLogin />
      <MockNotice />
    </>
  );
}
