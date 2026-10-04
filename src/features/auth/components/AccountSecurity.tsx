"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/fields";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";
import { z } from "zod";
import { authRequest } from "../http-repository";
import { passwordSchema } from "../schemas";

export function AccountSecurity() {
  const t = useTranslations("account");
  const auth = useTranslations("auth");
  const common = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState(false);
  const changePassword = useMutation({
    gcTime: 0,
    mutationFn: () => {
      if (!passwordSchema.safeParse(password).success) throw new Error("Invalid password");
      return authRequest("change-password", {
        currentPassword: current,
        newPassword: password,
        revokeOtherSessions: true,
      });
    },
    onSuccess: () => {
      setCurrent("");
      setPassword("");
      toast(t("passwordChanged"));
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const changeEmail = useMutation({
    mutationFn: () =>
      authRequest("change-email", { newEmail: email, callbackURL: "/verify-email" }),
    onSuccess: () => {
      setEmail("");
      toast(t("emailSent"));
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const deletion = useMutation({
    gcTime: 0,
    mutationFn: () =>
      createHttpClient().request("/api/v1/me", z.null(), {
        method: "DELETE",
        body: { password: current },
      }),
    onSuccess: () => {
      setCurrent("");
      // A full navigation clears session and private query caches after deletion.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-5 sm:p-7">
      <h2 className="text-lg font-bold">{t("title")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          changePassword.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label={t("currentPassword")}>
          {(control) => (
            <PasswordInput
              {...control}
              showLabel={auth("showPassword")}
              hideLabel={auth("hidePassword")}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("newPassword")} hint={auth("passwordHint")}>
          {(control) => (
            <PasswordInput
              {...control}
              showLabel={auth("showPassword")}
              hideLabel={auth("hidePassword")}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={changePassword.isPending}>
          {t("changePassword")}
        </Button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          changeEmail.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label={t("newEmail")} hint={t("emailVerification")}>
          {(control) => (
            <Input
              {...control}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={changeEmail.isPending}>
          {t("changeEmail")}
        </Button>
      </form>
      <p className="text-muted">{t("deleteBody")}</p>
      <Button
        variant="ghost"
        className="text-danger"
        loading={deletion.isPending}
        onClick={() => setConfirm(true)}
      >
        {t("deleteAccount")}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("deleteAccount")}
        description={t("deleteConfirm")}
        confirmLabel={t("deleteAccount")}
        cancelLabel={common("cancel")}
        onConfirm={() => deletion.mutate()}
      />
    </section>
  );
}
