"use client";

import { Download } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { cn } from "@/lib/cn";
import { toCsv } from "../lib/csv";
import { useProgressBoard } from "../hooks";
import type { ProgressBoard } from "../schemas";

/** Downloads the board as CSV (one row per student and set). */
function exportCsv(board: ProgressBoard, className: string, headers: string[]) {
  const studentName = new Map(board.students.map((s) => [s.id, s.name]));
  const setTitle = new Map(board.sets.map((s) => [s.id, s.title]));
  const csv = toCsv([
    headers,
    ...board.cells.map((cell) => [
      studentName.get(cell.studentId),
      setTitle.get(cell.setId),
      cell.knownPercent,
      cell.lastTestPercent,
      cell.lastStudiedAt,
    ]),
  ]);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${className.replace(/[\\/:*?"<>|]+/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Known-cards bar coloured by how far the student has got. */
function KnownBar({ percent }: { percent: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-16 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span
          className={cn(
            "block h-full rounded-full",
            percent >= 80 ? "bg-success" : percent >= 40 ? "bg-primary" : "bg-accent",
          )}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="font-bold tabular-nums">{percent}%</span>
    </span>
  );
}

/** Teacher's student × set table with CSV export. */
export function ClassProgress({ classId, className }: { classId: string; className: string }) {
  const t = useTranslations("classes");
  const format = useFormatter();
  const board = useProgressBoard(classId, true);
  if (board.error) return <QueryError error={board.error} onRetry={() => void board.refetch()} />;
  if (!board.data) return <Skeleton className="h-40" />;
  const data = board.data;
  if (!data.students.length || !data.sets.length)
    return <p className="text-muted">{t("progressEmpty")}</p>;
  const cell = (studentId: string, setId: string) =>
    data.cells.find((c) => c.studentId === studentId && c.setId === setId)!;
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        size="sm"
        className="self-end"
        onClick={() =>
          exportCsv(data, className, [
            t("student"),
            t("assignSet"),
            `${t("known")} (%)`,
            `${t("lastTest")} (%)`,
            t("lastStudied"),
          ])
        }
      >
        <Download className="size-4" aria-hidden />
        {t("exportCsv")}
      </Button>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[32rem] border-collapse bg-surface text-sm">
          <caption className="sr-only">{t("progressTitle")}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="sticky left-0 bg-surface-2 px-4 py-3 font-bold">
                {t("student")}
              </th>
              {data.sets.map((set) => (
                <th key={set.id} scope="col" className="px-4 py-3 font-bold">
                  {set.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr key={student.id} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 bg-surface px-4 py-3 text-left font-semibold"
                >
                  {student.name}
                </th>
                {data.sets.map((set) => {
                  const c = cell(student.id, set.id);
                  return (
                    <td key={set.id} className="px-4 py-3 align-top">
                      <KnownBar percent={c.knownPercent} />
                      <span className="mt-1 block text-xs text-muted">
                        {t("lastTest")}:{" "}
                        {c.lastTestPercent === null ? "—" : `${c.lastTestPercent}%`}
                      </span>
                      <span className="block text-xs text-muted">
                        {t("lastStudied")}:{" "}
                        {c.lastStudiedAt
                          ? format.relativeTime(new Date(c.lastStudiedAt))
                          : t("never")}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
