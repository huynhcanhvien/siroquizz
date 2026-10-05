"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";

const client = createHttpClient();
const reportSchema = z.object({
  id: z.uuid(),
  targetType: z.enum(["set", "user"]),
  targetId: z.string(),
  reason: z.enum(["spam", "inappropriate", "copyright", "other"]),
  note: z.string(),
  createdAt: z.string(),
  setTitle: z.string().nullable(),
  setSlug: z.string().nullable(),
  setHidden: z.boolean().nullable(),
  userName: z.string().nullable(),
  userBanned: z.boolean().nullable(),
});
const queueSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string().nullable(),
  status: z.enum(["pending", "flagged"]),
  reason: z.string().nullable(),
  updatedAt: z.string(),
});
const keys = { reports: ["admin", "reports"], queue: ["admin", "queue"] } as const;

function Row({
  title,
  detail,
  link,
  actions,
}: {
  title: ReactNode;
  detail: ReactNode;
  link: string | null;
  actions: ReactNode;
}) {
  const t = useTranslations("community.admin");
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold break-words">{title}</p>
        <p className="text-sm break-words text-muted">{detail}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {link ? (
          <Button asChild size="sm" variant="ghost">
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              {t("view")}
            </a>
          </Button>
        ) : null}
        {actions}
      </div>
    </li>
  );
}

function Section({
  id,
  title,
  empty,
  children,
}: {
  id: string;
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("community.admin");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {empty ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-6 text-center text-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {children}
        </ul>
      )}
    </section>
  );
}

/** Moderator workspace: open reports and public sets the automatic check could not clear. */
export function AdminPanel() {
  const t = useTranslations("community");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const reports = useQuery({
    queryKey: keys.reports,
    queryFn: async () => (await client.request("/api/v1/admin/reports", reportSchema.array())).data,
  });
  const queue = useQuery({
    queryKey: keys.queue,
    queryFn: async () =>
      (await client.request("/api/v1/admin/moderation", queueSchema.array())).data,
  });
  const act = useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      client.request(`/api/v1/admin/${path}`, z.null(), { method: "POST", body }),
    onSuccess: () => {
      toast(t("admin.done"));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });
  const button = (
    label: string,
    path: string,
    body?: object,
    variant: "secondary" | "soft" | "ghost" = "secondary",
  ) => (
    <Button
      size="sm"
      variant={variant}
      disabled={act.isPending}
      onClick={() => act.mutate({ path, body })}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-10">
      <h1 className="flex items-center gap-3 text-title font-extrabold">
        <ShieldCheck className="size-8 text-primary" aria-hidden />
        {t("admin.title")}
      </h1>
      <Section id="admin-reports" title={t("admin.reports")} empty={!reports.data?.length}>
        {reports.data?.map((report) => (
          <Row
            key={report.id}
            title={
              report.targetType === "set"
                ? t("admin.reportedSet", {
                    title: report.setTitle ?? "?",
                    name: report.userName ?? "?",
                  })
                : t("admin.reportedUser", { name: report.userName ?? "?" })
            }
            detail={[
              t(`reasons.${report.reason}`),
              report.note,
              new Date(report.createdAt).toLocaleString(),
            ]
              .filter(Boolean)
              .join(" · ")}
            link={report.setSlug ? `/s/${report.setSlug}` : null}
            actions={
              <>
                {button(
                  t("admin.dismiss"),
                  `reports/${report.id}/resolve`,
                  { action: "dismiss" },
                  "ghost",
                )}
                {report.targetType === "set"
                  ? button(t("admin.hide"), `reports/${report.id}/resolve`, { action: "hide" })
                  : null}
                {button(t("admin.ban"), `reports/${report.id}/resolve`, { action: "ban" }, "soft")}
              </>
            }
          />
        ))}
      </Section>
      <Section id="admin-queue" title={t("admin.queue")} empty={!queue.data?.length}>
        {queue.data?.map((set) => (
          <Row
            key={set.id}
            title={set.title}
            detail={[t(`admin.status.${set.status}`), set.reason].filter(Boolean).join(" · ")}
            link={set.slug ? `/s/${set.slug}` : null}
            actions={
              <>
                {button(t("admin.approve"), `sets/${set.id}/approve`)}
                {button(t("admin.reject"), `sets/${set.id}/reject`, {}, "soft")}
              </>
            }
          />
        ))}
      </Section>
    </div>
  );
}
