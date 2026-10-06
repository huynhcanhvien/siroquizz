"use client";

import { GraduationCap, School, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/fields";
import { Skeleton, Surface } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { classIdSchema, useClassAction, useClasses } from "../hooks";
import { isTeaching } from "../schemas";

function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface className="flex flex-col gap-3 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </Surface>
  );
}

/** A small form posting one value and opening the resulting class. */
function ActionForm({
  label,
  placeholder,
  submitLabel,
  path,
  field,
  done,
  maxLength,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  path: string;
  field: "name" | "code";
  done: string;
  maxLength: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const action = useClassAction();
  const [value, setValue] = useState("");
  const id = `class-${field}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.mutate(
      { path, method: "POST", body: { [field]: value.trim() } },
      {
        onSuccess: (result) => {
          toast(done);
          router.push(`/classes/${classIdSchema.parse(result.data).id}`);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          autoCapitalize={field === "code" ? "characters" : undefined}
          onChange={(event) =>
            setValue(field === "code" ? event.target.value.toUpperCase() : event.target.value)
          }
        />
        <Button type="submit" disabled={!value.trim() || action.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function ClassesView() {
  const t = useTranslations("classes");
  const classes = useClasses();
  const groups = [
    { key: "teaching", icon: School, items: classes.data?.filter((c) => isTeaching(c.role)) ?? [] },
    {
      key: "attending",
      icon: GraduationCap,
      items: classes.data?.filter((c) => !isTeaching(c.role)) ?? [],
    },
  ] as const;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-extrabold">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard title={t("joinTitle")}>
          <ActionForm
            label={t("code")}
            placeholder={t("codePlaceholder")}
            submitLabel={t("join")}
            path="/join"
            field="code"
            done={t("joined")}
            maxLength={6}
          />
        </FormCard>
        <FormCard title={t("createTitle")}>
          <ActionForm
            label={t("name")}
            placeholder={t("namePlaceholder")}
            submitLabel={t("create")}
            path=""
            field="name"
            done={t("created")}
            maxLength={80}
          />
        </FormCard>
      </div>
      {classes.error ? (
        <QueryError error={classes.error} onRetry={() => void classes.refetch()} />
      ) : !classes.data ? (
        <Skeleton className="h-40" />
      ) : (
        groups.map(({ key, icon: Icon, items }) => (
          <section key={key} aria-labelledby={`classes-${key}`} className="flex flex-col gap-3">
            <h2 id={`classes-${key}`} className="flex items-center gap-2 text-xl font-bold">
              <Icon className="size-5 text-primary" aria-hidden />
              {t(key)}
            </h2>
            {items.length ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/classes/${item.id}`}
                      className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <span className="text-lg font-bold">{item.name}</span>
                      <span className="text-sm text-muted">{t(`roles.${item.role}`)}</span>
                      <span className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-4" aria-hidden />
                          {t("students", { count: item.members })}
                        </span>
                        <span>{t("sets", { count: item.sets })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">{t("none")}</p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
