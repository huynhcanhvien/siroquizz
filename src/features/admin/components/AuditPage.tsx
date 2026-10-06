"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "../hooks";
import { auditSchema, pageSchema } from "../schemas";
import { AdminTable } from "./AdminTable";
import { QueryStatus } from "./QueryStatus";
import { SearchFilters, useAdminFilters } from "./SearchFilters";
export function AuditPage() {
  const t = useTranslations("admin");
  const params = useAdminFilters(["action", "actorId", "targetId"]);
  const query = useAdminQuery(`audit?${params}`, pageSchema(auditSchema));
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-extrabold">{t("audit")}</h1>
      <SearchFilters
        fields={[
          { key: "action", label: t("action"), pattern: "[a-z_]{1,40}", maxLength: 40 },
          {
            key: "actorId",
            label: t("actorId"),
            pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            maxLength: 36,
          },
          { key: "targetId", label: t("targetId"), maxLength: 64 },
        ]}
        nextCursor={query.data?.nextCursor}
      />
      <QueryStatus query={query} />
      {query.data ? (
        <AdminTable
          caption={t("audit")}
          items={query.data.items}
          columns={[
            { label: t("action"), render: (row) => row.action },
            {
              label: t("actor"),
              render: (row) =>
                row.actorId ? (
                  <Link
                    className="text-primary-text underline"
                    href={`/admin/users/${row.actorId}`}
                  >
                    {row.actorName ?? row.actorId}
                  </Link>
                ) : (
                  t("system")
                ),
            },
            {
              label: t("target"),
              render: (row) => (
                <>
                  {row.targetType}
                  <br />
                  {row.targetId}
                </>
              ),
            },
            { label: t("metadata"), render: (row) => (row.meta ? JSON.stringify(row.meta) : "—") },
            { label: t("createdAt"), render: (row) => new Date(row.createdAt).toLocaleString() },
          ]}
        />
      ) : null}
    </section>
  );
}
