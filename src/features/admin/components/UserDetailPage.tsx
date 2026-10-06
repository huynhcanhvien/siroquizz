"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/features/auth/hooks";
import { useAdminQuery } from "../hooks";
import { detailSchema } from "../schemas";
import { ActionButton, CreditAdjust } from "./ActionButton";
import { AdminTable } from "./AdminTable";
import { QueryStatus } from "./QueryStatus";
export function UserDetailPage({ id }: { id: string }) {
  const t = useTranslations("admin");
  const query = useAdminQuery(`users/${encodeURIComponent(id)}`, detailSchema);
  const session = useSession();
  const data = query.data;
  const self = !session.data || session.data.id === id;
  return (
    <section className="flex flex-col gap-5">
      <Link href="/admin/users" className="text-primary-text underline">
        {t("users")}
      </Link>
      <h1 className="text-title font-extrabold">{t("detail")}</h1>
      <QueryStatus query={query} />
      {data ? (
        <>
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-xl font-bold break-words">{data.user.name}</h2>
            <p className="break-words">{data.user.email}</p>
            <p className="mt-2 text-muted">
              {t(data.user.role === "admin" ? "admin" : "user")} ·{" "}
              {t(data.user.deletedAt ? "deleted" : data.user.bannedAt ? "banned" : "active")}
            </p>
            <p className="text-sm text-muted">
              {t("openReports")}: {data.openReports}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                label={t(data.user.bannedAt ? "unban" : "ban")}
                path={`users/${id}/${data.user.bannedAt ? "unban" : "ban"}`}
                disabled={self || !!data.user.deletedAt}
              />
              <ActionButton
                label={t(data.user.role === "admin" ? "revoke" : "grant")}
                path={`users/${id}/role`}
                method="PATCH"
                body={{ role: data.user.role === "admin" ? "user" : "admin" }}
                grant={data.user.role !== "admin"}
                disabled={
                  self ||
                  !!data.user.deletedAt ||
                  (!!data.user.bannedAt && data.user.role !== "admin")
                }
              />
              <CreditAdjust userId={id} disabled={self || !!data.user.deletedAt} />
            </div>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            {(["earned", "available", "reserved"] as const).map((key) => (
              <div key={key} className="rounded-xl border border-border p-4">
                <dt className="text-sm text-muted">{t(key)}</dt>
                <dd className="text-xl font-bold">{data.credits[key]}</dd>
              </div>
            ))}
          </dl>
          <h2 className="text-xl font-bold">{t("recentJobs")}</h2>
          <AdminTable
            caption={t("recentJobs")}
            items={data.jobs}
            columns={[
              { label: t("prompt"), render: (row) => row.prompt },
              { label: t("state"), render: (row) => t(`status.${row.status}`) },
              { label: t("credits"), render: (row) => row.creditsCharged },
              { label: t("error"), render: (row) => row.errorCode ?? "—" },
            ]}
          />
          <h2 className="text-xl font-bold">{t("userSets")}</h2>
          <AdminTable
            caption={t("userSets")}
            items={data.sets}
            columns={[
              {
                label: t("setTitle"),
                render: (row) =>
                  row.slug ? (
                    <Link className="text-primary-text underline" href={`/s/${row.slug}`}>
                      {row.title}
                    </Link>
                  ) : (
                    row.title
                  ),
              },
              {
                label: t("state"),
                render: (row) => t(`status.${row.hiddenAt ? "hidden" : row.moderationStatus}`),
              },
              { label: t("cards"), render: (row) => row.cardCount },
            ]}
          />
          <h2 className="text-xl font-bold">{t("ledger")}</h2>
          <AdminTable
            caption={t("ledger")}
            items={data.ledger}
            columns={[
              { label: t("delta"), render: (row) => row.delta },
              { label: t("action"), render: (row) => row.reason },
              { label: t("createdAt"), render: (row) => new Date(row.createdAt).toLocaleString() },
            ]}
          />
        </>
      ) : null}
    </section>
  );
}
