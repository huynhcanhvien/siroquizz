"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, PasswordInput } from "@/components/ui/fields";
import { useErrorMessage } from "@/lib/use-messages";
import { authRequest } from "../http-repository";
import { passwordSchema } from "../schemas";
import { AuthHeading, FormError } from "./AuthCard";
export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const errorMessage = useErrorMessage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [invalid, setInvalid] = useState(false);
  const token = params.get("token");
  const reset = useMutation({
    gcTime: 0,
    mutationFn: () => authRequest("reset-password", { token, newPassword: password }),
    onSuccess: () => {
      setPassword("");
      setConfirm("");
    },
  });
  return (
    <>
      <AuthHeading title={t("resetTitle")} subtitle={t("passwordHint")} />
      {!token || params.get("error") ? (
        <>
          <FormError message={t("invalidLink")} />
          <Link href="/forgot-password">{t("forgotLink")}</Link>
        </>
      ) : reset.isSuccess ? (
        <p role="status">{t("resetDone")}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const valid = passwordSchema.safeParse(password).success && password === confirm;
            setInvalid(!valid);
            if (valid) reset.mutate();
          }}
          className="flex flex-col gap-5"
        >
          <FormError
            message={invalid ? t("passwordHint") : reset.isError ? errorMessage(reset.error) : null}
          />
          <Field label={t("password")}>
            {(control) => (
              <PasswordInput
                {...control}
                showLabel={t("showPassword")}
                hideLabel={t("hidePassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field label={t("confirmPassword")}>
            {(control) => (
              <PasswordInput
                {...control}
                showLabel={t("showPassword")}
                hideLabel={t("hidePassword")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Button type="submit" loading={reset.isPending}>
            {t("resetSubmit")}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-block font-semibold text-primary-text">
        {t("backToLogin")}
      </Link>
    </>
  );
}
