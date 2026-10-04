"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/fields";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { preferencesSchema } from "../schemas";
import { usePreferences, useSavePreferences } from "../hooks";
function PreferenceForm({ initial }: { initial: z.infer<typeof preferencesSchema> }) {
  const t = useTranslations("learning"),
    [value, setValue] = useState(initial),
    mutation = useSavePreferences(),
    { toast } = useToast(),
    errorMessage = useErrorMessage();
  const patch = (data: Partial<typeof value>) => setValue((v) => ({ ...v, ...data }));
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const result = preferencesSchema.safeParse(value);
        if (!result.success) {
          toast(t("invalidPreferences"), "error");
          return;
        }
        mutation.mutate(result.data, {
          onSuccess: () => toast(t("preferencesSaved")),
          onError: (e) => toast(errorMessage(e), "error"),
        });
      }}
    >
      <Field label={t("newPerDay")}>
        {(control) => (
          <Input
            {...control}
            type="number"
            min={0}
            max={100}
            value={value.newCardsPerDay}
            onChange={(e) => patch({ newCardsPerDay: Number(e.target.value) })}
          />
        )}
      </Field>
      <Field label={t("retention")}>
        {(control) => (
          <Input
            {...control}
            type="number"
            min={0.7}
            max={0.97}
            step={0.01}
            value={value.retention}
            onChange={(e) => patch({ retention: Number(e.target.value) })}
          />
        )}
      </Field>
      <Field label={t("timeZone")}>
        {(control) => (
          <Input
            {...control}
            value={value.timeZone}
            onChange={(e) => patch({ timeZone: e.target.value })}
          />
        )}
      </Field>
      <Field label={t("goal")}>
        {(control) => (
          <Input
            {...control}
            type="number"
            min={1}
            max={500}
            value={value.goal}
            onChange={(e) => patch({ goal: Number(e.target.value) })}
          />
        )}
      </Field>
      <Field label={t("goalType")}>
        {(control) => (
          <Select
            {...control}
            value={value.goalType}
            onChange={(e) => patch({ goalType: e.target.value as "cards" | "minutes" })}
          >
            <option value="cards">{t("cards")}</option>
            <option value="minutes">{t("minutes")}</option>
          </Select>
        )}
      </Field>
      <Field label={t("reminderHour")}>
        {(control) => (
          <Input
            {...control}
            type="number"
            min={0}
            max={23}
            value={value.reminderHour}
            onChange={(e) => patch({ reminderHour: Number(e.target.value) })}
          />
        )}
      </Field>
      <div className="sm:col-span-2">
        <Switch
          checked={value.reminderEnabled}
          onCheckedChange={(reminderEnabled) => patch({ reminderEnabled })}
          label={t("emailReminder")}
        />
        <p className="mt-2 text-sm text-muted">{t("reminderHint")}</p>
      </div>
      <Button type="submit" loading={mutation.isPending} className="sm:col-span-2">
        {t("savePreferences")}
      </Button>
    </form>
  );
}
export function LearningPreferences() {
  const t = useTranslations("learning"),
    query = usePreferences();
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-7">
      <h2 className="mb-5 text-lg font-bold">{t("preferences")}</h2>
      {query.data ? <PreferenceForm initial={query.data} /> : <p role="status">{t("loading")}</p>}
    </section>
  );
}
