"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useAdminQuery } from "../hooks";
import { historySchema, pageSchema, setSchema } from "../schemas";
import { ActionButton } from "./ActionButton";
import { AdminTable } from "./AdminTable";
import { QueryStatus } from "./QueryStatus";
import { SearchFilters, useAdminFilters } from "./SearchFilters";
function History({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("admin");
  const query = useAdminQuery(`sets/${id}/history`, historySchema.array());
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      title={t("history")}
      size="lg"
    >
      <QueryStatus query={query} />
      {query.data ? (
        <AdminTable
          caption={t("history")}
          items={query.data}
          columns={[
            { label: t("action"), render: (row) => row.action },
            { label: t("actor"), render: (row) => row.actorName ?? t("system") },
            { label: t("metadata"), render: (row) => JSON.stringify(row.meta) },
            { label: t("createdAt"), render: (row) => new Date(row.createdAt).toLocaleString() },
          ]}
        />
      ) : null}
    </Dialog>
  );
}
export function SetsPage() {
  const t = useTranslations("admin");
  const params = useAdminFilters(["q", "status"]);
  const query = useAdminQuery(`sets?${params}`, pageSchema(setSchema));
  const [history, setHistory] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-extrabold">{t("sets")}</h1>
      <SearchFilters
        fields={[
          { key: "q", label: t("search") },
          {
            key: "status",
            label: t("state"),
            options: (
              ["none", "pending", "approved", "flagged", "rejected", "hidden"] as const
            ).map((value) => ({ value, label: t(`status.${value}`) })),
          },
        ]}
        nextCursor={query.data?.nextCursor}
      />
      <QueryStatus query={query} />
      {query.data ? (
        <AdminTable
          caption={t("sets")}
          items={query.data.items}
          columns={[
            {
              label: t("setTitle"),
              render: (row) =>
                row.slug ? (
                  <Link
                    className="font-semibold text-primary-text underline"
                    href={`/s/${row.slug}`}
                  >
                    {row.title}
                  </Link>
                ) : (
                  row.title
                ),
            },
            {
              label: t("owner"),
              render: (row) => (
                <Link className="text-primary-text underline" href={`/admin/users/${row.ownerId}`}>
                  {row.ownerName}
                </Link>
              ),
            },
            {
              label: t("state"),
              render: (row) => (
                <>
                  {t(`status.${row.hiddenAt ? "hidden" : row.moderationStatus}`)}
                  <p className="text-sm text-muted">{row.moderationReason}</p>
                </>
              ),
            },
            { label: t("cards"), render: (row) => row.cardCount },
            {
              label: t("actions"),
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={t(row.hiddenAt ? "restore" : "hide")}
                    path={`sets/${row.id}/${row.hiddenAt ? "restore" : "hide"}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setHistory(row.id)}>
                    {t("history")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      ) : null}
      {history ? <History id={history} onClose={() => setHistory(null)} /> : null}
    </section>
  );
}
