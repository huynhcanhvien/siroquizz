"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
export type Column<T> = { label: string; render: (row: T) => ReactNode };
export function AdminTable<T extends { id: string }>({
  items,
  columns,
  caption,
}: {
  items: T[];
  columns: Column<T>[];
  caption: string;
}) {
  const t = useTranslations("admin");
  if (!items.length)
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-muted">{t("empty")}</p>
    );
  return (
    <>
      <ul
        aria-label={caption}
        className="divide-y divide-border rounded-xl border border-border bg-surface md:hidden"
      >
        {items.map((row) => (
          <li key={row.id} className="p-4">
            <dl className="flex flex-col gap-3">
              {columns.map((col) => (
                <div key={col.label} className="min-w-0">
                  <dt className="text-sm text-muted">{col.label}</dt>
                  <dd className="mt-1 [overflow-wrap:anywhere] break-words">{col.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full bg-surface text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2">
            <tr>
              {columns.map((col) => (
                <th scope="col" key={col.label} className="px-4 py-3">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <td
                    key={col.label}
                    className="max-w-64 px-4 py-3 [overflow-wrap:anywhere] break-words"
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
