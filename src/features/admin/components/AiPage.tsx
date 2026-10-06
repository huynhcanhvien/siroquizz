"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAdminQuery } from "../hooks";
import { jobSchema, pageSchema } from "../schemas";
import { ActionButton, CreditAdjust } from "./ActionButton";
import { AdminTable } from "./AdminTable";
import { QueryStatus } from "./QueryStatus";
import { SearchFilters, useAdminFilters } from "./SearchFilters";
export function AiPage() {
  const t = useTranslations("admin");
  const params = useAdminFilters(["status", "userId"]);
  const query = useAdminQuery(`jobs?${params}`, pageSchema(jobSchema), true);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-extrabold">{t("ai")}</h1>
      <div>
        <CreditAdjust />
      </div>
      <p className="text-sm text-muted">{t("refreshHint")}</p>
      <SearchFilters
        fields={[
          {
            key: "status",
            label: t("state"),
            options: (["active", "awaiting", "done", "error", "cancelled"] as const).map(
              (value) => ({
                value,
                label: t(`status.${value}`),
              }),
            ),
          },
          {
            key: "userId",
            label: t("userId"),
            pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            maxLength: 36,
          },
        ]}
        nextCursor={query.data?.nextCursor}
      />
      <QueryStatus query={query} />
      {query.data ? (
        <AdminTable
          caption={t("ai")}
          items={query.data.items}
          columns={[
            {
              label: t("users"),
              render: (row) => (
                <Link className="text-primary-text underline" href={`/admin/users/${row.userId}`}>
                  {row.userName}
                  <span className="block text-sm text-muted">{row.userEmail}</span>
                </Link>
              ),
            },
            {
              label: t("prompt"),
              render: (row) => (
                <>
                  {row.prompt}
                  <span className="block text-sm text-muted">{row.model ?? "—"}</span>
                </>
              ),
            },
            {
              label: t("state"),
              render: (row) => (
                <>
                  {t(`status.${row.status}`)}
                  <span className="block text-sm text-muted">{row.errorCode}</span>
                </>
              ),
            },
            { label: t("tokens"), render: (row) => row.inputTokens + row.outputTokens },
            {
              label: t("credits"),
              render: (row) => (
                <>
                  {t("reserved")}: {row.creditsReserved}
                  <br />
                  {t("credits")}: {row.creditsCharged}
                </>
              ),
            },
            { label: t("createdAt"), render: (row) => new Date(row.createdAt).toLocaleString() },
            {
              label: t("actions"),
              render: (row) =>
                ["queued", "extracting", "generating", "validating", "awaiting"].includes(
                  row.status,
                ) ? (
                  <ActionButton label={t("cancelJob")} path={`jobs/${row.id}/cancel`} />
                ) : (
                  "—"
                ),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
