"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/fields";
import { filterParams, updateFilters } from "../lib/filters";
export type Filter = {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
  maxLength?: number;
  pattern?: string;
};
export function useAdminFilters(keys: readonly string[]) {
  const params = useSearchParams();
  return filterParams(new URLSearchParams(params.toString()), keys).toString();
}
export function SearchFilters({
  fields,
  nextCursor,
}: {
  fields: Filter[];
  nextCursor?: string | null;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("admin");
  const navigate = (next: URLSearchParams) =>
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  return (
    <div className="flex flex-col gap-3">
      <form
        key={params.toString()}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          navigate(
            updateFilters(
              new URLSearchParams(params.toString()),
              Object.fromEntries(
                fields.map((field) => [field.key, String(data.get(field.key) ?? "")]),
              ),
            ),
          );
        }}
      >
        {fields.map((field) => (
          <Field key={field.key} label={field.label} className="min-w-0 flex-1 basis-40">
            {(control) =>
              field.options ? (
                <Select {...control} name={field.key} defaultValue={params.get(field.key) ?? ""}>
                  <option value="">{t("all")}</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...control}
                  name={field.key}
                  defaultValue={params.get(field.key) ?? ""}
                  maxLength={field.maxLength ?? 100}
                  pattern={field.pattern}
                />
              )
            }
          </Field>
        ))}
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
        <Button variant="ghost" onClick={() => navigate(new URLSearchParams())}>
          {t("reset")}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {params.has("cursor") ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              next.delete("cursor");
              navigate(next);
            }}
          >
            {t("firstPage")}
          </Button>
        ) : null}
        {nextCursor ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              next.set("cursor", nextCursor);
              navigate(next);
            }}
          >
            {t("nextPage")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
