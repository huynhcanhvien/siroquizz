"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, PasswordInput } from "@/components/ui/fields";
import { safeNextPath } from "@/lib/safe-redirect";
import { useErrorMessage, useValidationMessage } from "@/lib/use-messages";
import { useLogin } from "../hooks";
import { loginSchema, type LoginInput } from "../schemas";
import { AuthHeading, FormError, MockNotice, SocialButtons } from "./AuthCard";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const validationMessage = useValidationMessage();
  const errorMessage = useErrorMessage();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: () => router.replace(safeNextPath(searchParams.get("next"))),
    }),
  );

  return (
    <>
      <AuthHeading title={t("loginTitle")} subtitle={t("loginSubtitle")} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError message={login.isError ? errorMessage(login.error) : null} />
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
        <Field label={t("password")} error={validationMessage(errors.password?.message)}>
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="current-password"
              showLabel={t("showPassword")}
              hideLabel={t("hidePassword")}
              {...register("password")}
            />
          )}
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Checkbox label={t("remember")} {...register("remember")} />
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-primary-text hover:underline"
          >
            {t("forgotLink")}
          </Link>
        </div>
        <Button type="submit" size="lg" loading={login.isPending}>
          {login.isPending ? t("submitting") : t("submitLogin")}
        </Button>
      </form>
      <SocialButtons />
      <p className="mt-8 text-center text-muted">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-semibold text-primary-text hover:underline">
          {t("submitRegister")}
        </Link>
      </p>
      <MockNotice />
    </>
  );
}
