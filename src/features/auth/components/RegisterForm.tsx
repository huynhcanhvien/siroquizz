"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldMessage, Field, Input, PasswordInput } from "@/components/ui/fields";
import { useErrorMessage, useValidationMessage } from "@/lib/use-messages";
import { useRegister } from "../hooks";
import { registerSchema, type RegisterInput } from "../schemas";
import { AuthHeading, FormError, MockNotice, SocialButtons } from "./AuthCard";

export function RegisterForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const registerUser = useRegister();
  const validationMessage = useValidationMessage();
  const errorMessage = useErrorMessage();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const onSubmit = handleSubmit((values) =>
    registerUser.mutate(values, {
      onSuccess: () =>
        router.replace(process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? "/verify-email" : "/home"),
    }),
  );

  const passwordProps = { showLabel: t("showPassword"), hideLabel: t("hidePassword") };

  return (
    <>
      <AuthHeading title={t("registerTitle")} subtitle={t("registerSubtitle")} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError message={registerUser.isError ? errorMessage(registerUser.error) : null} />
        <Field label={t("displayName")} error={validationMessage(errors.displayName?.message)}>
          {(control) => (
            <Input
              {...control}
              autoComplete="nickname"
              placeholder={t("displayNamePlaceholder")}
              {...register("displayName")}
            />
          )}
        </Field>
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
        <Field
          label={t("password")}
          error={validationMessage(errors.password?.message)}
          hint={t("passwordHint")}
        >
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              {...passwordProps}
              {...register("password")}
            />
          )}
        </Field>
        <Field
          label={t("confirmPassword")}
          error={validationMessage(errors.confirmPassword?.message)}
        >
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              {...passwordProps}
              {...register("confirmPassword")}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <Checkbox
            label={t("acceptTerms")}
            aria-invalid={Boolean(errors.acceptTerms)}
            aria-describedby={errors.acceptTerms ? "accept-terms-error" : undefined}
            {...register("acceptTerms")}
          />
          <FieldMessage
            id="accept-terms-error"
            error={validationMessage(errors.acceptTerms?.message)}
          />
        </div>
        <Button type="submit" size="lg" loading={registerUser.isPending}>
          {registerUser.isPending ? t("submitting") : t("submitRegister")}
        </Button>
      </form>
      <SocialButtons />
      <p className="mt-8 text-center text-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-primary-text hover:underline">
          {t("submitLogin")}
        </Link>
      </p>
      <MockNotice />
    </>
  );
}
