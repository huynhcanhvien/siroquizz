"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "../hooks";
import { pageSchema, userSchema } from "../schemas";
import { AdminTable } from "./AdminTable";
import { QueryStatus } from "./QueryStatus";
import { SearchFilters, useAdminFilters } from "./SearchFilters";
export function UsersPage() {
  const t = useTranslations("admin");
  const params = useAdminFilters(["q"]);
  const query = useAdminQuery(`users?${params}`, pageSchema(userSchema));
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-extrabold">{t("users")}</h1>
      <SearchFilters
        fields={[{ key: "q", label: t("search") }]}
        nextCursor={query.data?.nextCursor}
      />
      <QueryStatus query={query} />
      {query.data ? (
        <AdminTable
          caption={t("users")}
          items={query.data.items}
          columns={[
            {
              label: t("name"),
              render: (row) => (
                <Link
                  className="font-semibold text-primary-text underline"
                  href={`/admin/users/${row.id}`}
                >
                  {row.name}
                </Link>
              ),
            },
            { label: t("email"), render: (row) => row.email },
            { label: t("role"), render: (row) => t(row.role === "admin" ? "admin" : "user") },
            {
              label: t("state"),
              render: (row) => t(row.deletedAt ? "deleted" : row.bannedAt ? "banned" : "active"),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
