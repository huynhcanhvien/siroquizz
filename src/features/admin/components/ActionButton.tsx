"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/Dialog";
import { useAdminMutation } from "../hooks";
export function ActionButton({
  label,
  path,
  body,
  method,
  disabled,
  grant = false,
}: {
  label: string;
  path: string;
  body?: object;
  method?: "POST" | "PATCH";
  disabled?: boolean;
  grant?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const mutation = useAdminMutation();
  const t = useTranslations("admin");
  const confirm = () =>
    mutation.mutate(
      { path, body, method },
      {
        onSuccess: () => {
          setOpen(false);
          setVerified(false);
        },
      },
    );
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || mutation.isPending}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) {
            setOpen(value);
            setVerified(false);
          }
        }}
        title={label}
        description={grant && !verified ? t("grantWarning") : t("confirmDescription")}
        confirmLabel={grant && !verified ? t("continue") : t("confirm")}
        cancelLabel={t("cancel")}
        loading={mutation.isPending}
        onConfirm={() => {
          if (grant && !verified) setVerified(true);
          else confirm();
        }}
      />
    </>
  );
}
export function CreditAdjust({
  userId,
  disabled = false,
}: {
  userId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("admin");
  const mutation = useAdminMutation();
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState<{ id: string; delta: number; note: string } | null>(null);
  const submit = () => {
    if (!pending) return;
    mutation.mutate(
      { path: `users/${pending.id}/credits`, body: { delta: pending.delta, note: pending.note } },
      {
        onSuccess: () => {
          setPending(null);
          setOpen(false);
        },
      },
    );
  };
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        {t("adjustCredits")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) {
            setOpen(value);
            setPending(null);
          }
        }}
        title={t("adjustCredits")}
        description={
          pending
            ? t("creditConfirm", { delta: pending.delta, userId: pending.id, note: pending.note })
            : t("creditHint")
        }
        footer={
          pending ? (
            <>
              <Button
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => setPending(null)}
              >
                {t("cancel")}
              </Button>
              <Button loading={mutation.isPending} onClick={submit}>
                {t("confirm")}
              </Button>
            </>
          ) : undefined
        }
      >
        {!pending ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const delta = Number(data.get("delta"));
              if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) {
                setInvalid(true);
                return;
              }
              setInvalid(false);
              setPending({
                id: userId ?? String(data.get("userId")),
                delta,
                note: String(data.get("note")).trim(),
              });
            }}
          >
            {!userId ? (
              <Field label={t("userId")}>
                {(control) => (
                  <Input
                    {...control}
                    name="userId"
                    required
                    pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                  />
                )}
              </Field>
            ) : null}
            <Field
              label={t("delta")}
              hint={t("deltaHint")}
              error={invalid ? t("deltaHint") : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  name="delta"
                  type="number"
                  min={-1000}
                  max={1000}
                  step={1}
                  required
                />
              )}
            </Field>
            <Field label={t("note")}>
              {(control) => (
                <Input {...control} name="note" required maxLength={200} pattern=".*\S.*" />
              )}
            </Field>
            <Button type="submit" disabled={mutation.isPending}>
              {t("continue")}
            </Button>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
