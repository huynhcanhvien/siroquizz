"use client";

import { ArrowLeft, PenLine } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { EmptyState, Skeleton, Surface } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { useClass } from "@/features/classes/hooks";
import { useErrorMessage } from "@/lib/use-messages";
import { createSessionPath, useSessionAction, useWritingSessions } from "../hooks";
import { MAX_PROMPT_CHARS, MAX_TITLE_CHARS } from "../lib/limits";
import { teaches } from "../lib/permissions";
import { StatusBadge } from "./SessionBits";

function NewSessionForm({ classId }: { classId: string }) {
  const t = useTranslations("writing.sessions");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const action = useSessionAction();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.mutate(
      { path: createSessionPath(classId), method: "POST", body: { title, prompt } },
      {
        onSuccess: () => {
          toast(t("created"));
          setTitle("");
          setPrompt("");
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  };
  return (
    <Surface className="p-5">
      <form onSubmit={submit} className="space-y-3" aria-label={t("new")}>
        <h2 className="text-lg font-bold">{t("new")}</h2>
        <Field label={t("titleLabel")}>
          {(control) => (
            <Input
              {...control}
              value={title}
              required
              maxLength={MAX_TITLE_CHARS}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <Field label={t("promptLabel")}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={prompt}
              maxLength={MAX_PROMPT_CHARS}
              placeholder={t("promptPlaceholder")}
              onChange={(event) => setPrompt(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={action.isPending} disabled={!title.trim()}>
          {t("create")}
        </Button>
      </form>
    </Surface>
  );
}

/** The class's writing sessions; teachers also create them here. */
export function SessionList({ classId }: { classId: string }) {
  const t = useTranslations("writing.sessions");
  const format = useFormatter();
  const klass = useClass(classId);
  const sessions = useWritingSessions(classId);
  if (klass.error || sessions.error)
    return (
      <QueryError error={klass.error ?? sessions.error} onRetry={() => void sessions.refetch()} />
    );
  if (!klass.data || !sessions.data) return <Skeleton className="h-64 w-full rounded-xl" />;
  const teacher = teaches(klass.data.role);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/classes/${classId}`}>
          <ArrowLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
      </Button>
      <header>
        <h1 className="text-title font-extrabold">{t("title")}</h1>
        <p className="mt-1 text-muted">
          {klass.data.name} · {t("subtitle")}
        </p>
      </header>
      {teacher ? <NewSessionForm classId={classId} /> : null}
      {sessions.data.length ? (
        <ul className="space-y-3">
          {sessions.data.map((session) => (
            <li key={session.id}>
              <Surface className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">
                    <span className="truncate">{session.title}</span>
                    <StatusBadge status={session.status} />
                  </p>
                  <p className="text-sm text-muted">
                    {format.dateTime(new Date(session.createdAt), { dateStyle: "medium" })}
                    {session.docCount === null
                      ? null
                      : ` · ${t("docCount", { count: session.docCount })}`}
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant={session.status === "open" ? "primary" : "secondary"}
                >
                  <Link href={`/study/writing/${session.id}`}>
                    <PenLine className="size-4" aria-hidden />
                    {session.status === "open" && !teacher ? t("open") : t("view")}
                  </Link>
                </Button>
              </Surface>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<PenLine aria-hidden />}
          title={t("title")}
          body={teacher ? t("empty") : t("emptyStudent")}
        />
      )}
    </div>
  );
}
