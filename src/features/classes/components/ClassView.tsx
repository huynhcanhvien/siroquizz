"use client";

import { Copy, LogOut, PenLine, RefreshCw, Trash, UserCog, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Label, Select } from "@/components/ui/fields";
import { Avatar, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/features/auth/hooks";
import { useSets } from "@/features/sets/hooks";
import { useErrorMessage } from "@/lib/use-messages";
import { useClass, useClassAction } from "../hooks";
import { isTeaching, type ClassDetail } from "../schemas";
import { ClassProgress } from "./ClassProgress";
import { DeadlineCalendar } from "./DeadlineCalendar";
import { ClassLibrarySection } from "@/features/class-library/components/ClassLibrarySection";

function Section({
  id,
  title,
  children,
  action,
}: {
  id: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Runs a class action with the usual toasts. */
function useRun() {
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const action = useClassAction();
  // mutateAsync settles even when the refetch after leaving/deleting unmounts this component,
  // so the toast and the redirect still happen (mutate callbacks would be dropped).
  const run = (request: Parameters<typeof action.mutate>[0], done: string, then?: () => void) =>
    action.mutateAsync(request).then(
      () => {
        toast(done);
        then?.();
      },
      (error: unknown) => toast(errorMessage(error), "error"),
    );
  return { run, pending: action.isPending };
}

function InviteCard({ klass }: { klass: ClassDetail }) {
  const t = useTranslations("classes");
  const { toast } = useToast();
  const { run, pending } = useRun();
  const link = `${typeof window === "undefined" ? "" : window.location.origin}/classes/join/${klass.joinCode}`;
  return (
    <Section id="class-invite" title={t("invite")}>
      <div className="flex flex-wrap items-center gap-4">
        <span className="rounded-xl bg-primary-soft px-4 py-2 font-mono text-3xl font-extrabold tracking-[0.3em] text-primary-text">
          {klass.joinCode}
        </span>
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            toast(t("linkCopied"));
          }}
        >
          <Copy className="size-4" aria-hidden />
          {t("copyLink")}
        </Button>
        {klass.role === "owner" ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run({ path: `/${klass.id}/code`, method: "POST" }, t("codeChanged"))}
          >
            <RefreshCw className="size-4" aria-hidden />
            {t("newCode")}
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted">{t("inviteHint")}</p>
      <Switch
        checked={Boolean(klass.joinLocked)}
        label={t("lock")}
        onCheckedChange={(joinLocked) =>
          run({ path: `/${klass.id}`, method: "PATCH", body: { joinLocked } }, t("saved"))
        }
      />
    </Section>
  );
}

function AssignForm({ klass }: { klass: ClassDetail }) {
  const t = useTranslations("classes");
  const { data: user } = useSession();
  const sets = useSets();
  const { run, pending } = useRun();
  const setFieldId = useId();
  const dueId = useId();
  const [setId, setSetId] = useState("");
  const [due, setDue] = useState("");
  const assigned = new Set(klass.sets.map((set) => set.setId));
  const mine = (sets.data ?? []).filter((set) => set.ownerId === user?.id && !assigned.has(set.id));
  return (
    <form
      className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        // A due date means the end of that day in the teacher's time zone.
        const dueAt = due ? new Date(`${due}T23:59:00`).toISOString() : null;
        run(
          { path: `/${klass.id}/sets/${setId}`, method: "PUT", body: { dueAt } },
          t("assigned"),
          () => {
            setSetId("");
            setDue("");
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={setFieldId}>{t("assignSet")}</Label>
        <Select
          id={setFieldId}
          value={setId}
          onChange={(event) => setSetId(event.target.value)}
          required
        >
          <option value="">{t("chooseSet")}</option>
          {mine.map((set) => (
            <option key={set.id} value={set.id}>
              {set.title}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={dueId}>{t("due")}</Label>
        <Input
          id={dueId}
          type="date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={!setId || pending}>
        {t("assign")}
      </Button>
    </form>
  );
}

function AssignedList({ klass }: { klass: ClassDetail }) {
  const t = useTranslations("classes");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const { run, pending } = useRun();
  const teaching = isTeaching(klass.role);
  if (!klass.sets.length) return <p className="text-muted">{t("noAssigned")}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {klass.sets.map((set) => (
        <li key={set.setId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{set.title}</p>
            <p className="text-sm text-muted">
              {tCommon("cards", { count: set.cardCount })} ·{" "}
              {set.dueAt
                ? t("dueOn", {
                    date: format.dateTime(new Date(set.dueAt), { dateStyle: "medium" }),
                  })
                : t("noDue")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href={`/sets/${set.setId}`}>{t("study")}</Link>
            </Button>
            {teaching ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("unassign", { title: set.title })}
                disabled={pending}
                onClick={() =>
                  run({ path: `/${klass.id}/sets/${set.setId}`, method: "DELETE" }, t("unassigned"))
                }
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Members({ klass }: { klass: ClassDetail }) {
  const t = useTranslations("classes");
  const { data: user } = useSession();
  const { run, pending } = useRun();
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {klass.members.map((member) => {
        const canRemove =
          member.userId !== user?.id &&
          member.role !== "owner" &&
          (member.role === "student" || klass.role === "owner");
        return (
          <li key={member.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={member.name} color={member.avatarColor} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{member.name}</span>
                <span className="text-xs text-muted">{t(`roles.${member.role}`)}</span>
              </span>
            </span>
            <span className="flex gap-1">
              {klass.role === "owner" && member.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      {
                        path: `/${klass.id}/members/${member.userId}`,
                        method: "PATCH",
                        body: { role: member.role === "student" ? "teacher" : "student" },
                      },
                      t("saved"),
                    )
                  }
                >
                  <UserCog className="size-4" aria-hidden />
                  {member.role === "student" ? t("makeTeacher") : t("makeStudent")}
                </Button>
              ) : null}
              {canRemove ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("remove", { name: member.name })}
                  disabled={pending}
                  onClick={() =>
                    run(
                      { path: `/${klass.id}/members/${member.userId}`, method: "DELETE" },
                      t("removed"),
                    )
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Leave (students, co-teachers) or delete (owner) behind a confirmation. */
function ExitClass({ klass }: { klass: ClassDetail }) {
  const t = useTranslations("classes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useRun();
  const [open, setOpen] = useState(false);
  const owner = klass.role === "owner";
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {owner ? (
          <Trash className="size-4" aria-hidden />
        ) : (
          <LogOut className="size-4" aria-hidden />
        )}
        {owner ? t("delete") : t("leave")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={owner ? t("deleteTitle") : t("leaveTitle")}
        description={
          owner ? t("deleteBody", { name: klass.name }) : t("leaveBody", { name: klass.name })
        }
        confirmLabel={t("confirm")}
        cancelLabel={tCommon("cancel")}
        loading={pending}
        onConfirm={() =>
          run(
            owner
              ? { path: `/${klass.id}`, method: "DELETE" }
              : { path: `/${klass.id}/leave`, method: "POST" },
            owner ? t("deleted") : t("left"),
            () => router.replace("/classes"),
          )
        }
      />
    </>
  );
}

export function ClassView({ id }: { id: string }) {
  const t = useTranslations("classes");
  const query = useClass(id);
  if (query.error) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton className="h-72" />;
  const klass = query.data;
  const teaching = isTeaching(klass.role);
  const teachers = klass.members.filter((m) => m.role !== "student").map((m) => m.name);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-extrabold text-balance">{klass.name}</h1>
          <p className="text-muted">
            {t(`roles.${klass.role}`)}
            {teaching ? "" : ` · ${t("teachers")}: ${teachers.join(", ")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/classes/${klass.id}/writing`}>
              <PenLine className="size-4" aria-hidden />
              {t("writing")}
            </Link>
          </Button>
          <ExitClass klass={klass} />
        </div>
      </header>
      {teaching ? <InviteCard klass={klass} /> : null}
      <Section id="class-calendar" title={t("calendar.title")}>
        <DeadlineCalendar sets={klass.sets} />
      </Section>
      <Section id="class-sets" title={t("assignedTitle")}>
        {teaching ? <AssignForm klass={klass} /> : null}
        <AssignedList klass={klass} />
      </Section>
      <ClassLibrarySection classId={klass.id} />
      {teaching ? (
        <>
          <Section id="class-progress" title={t("progressTitle")}>
            <ClassProgress classId={klass.id} className={klass.name} />
          </Section>
          <Section id="class-members" title={t("membersTitle")}>
            <Members klass={klass} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
