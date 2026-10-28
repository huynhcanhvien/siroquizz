"use client";

import { Library, Plus, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/fields";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { SET_SOURCES } from "@/lib/types";
import { useSets } from "../hooks";
import { filterAndSortSets, type LibrarySort, type LibrarySourceFilter } from "../lib/set-utils";
import { FolderDropBar, dragSet } from "@/features/folders/components/FolderDropBar";
import { NewFolderButton } from "@/features/folders/components/FoldersView";
import { SetCard } from "./SetCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { FromClassLibrary } from "@/features/class-library/components/FromClassLibrary";

type LibraryTab = "mine" | "class";
/** "Mine | From classes", kept in the `tab` URL parameter like the other library filters. */
function useLibraryTab() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<LibraryTab>(() =>
    searchParams.get("tab") === "class" ? "class" : "mine",
  );
  const change = (next: LibraryTab) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "class") params.set("tab", next);
    else params.delete("tab");
    window.history.replaceState(null, "", params.size ? `?${params}` : window.location.pathname);
  };
  return [tab, change] as const;
}

const SORTS: readonly LibrarySort[] = ["recent", "title", "cards"];
const SORT_LABEL = { recent: "sortRecent", title: "sortTitle", cards: "sortCards" } as const;

function parseSort(value: string | null): LibrarySort {
  return SORTS.includes(value as LibrarySort) ? (value as LibrarySort) : "recent";
}

function parseSource(value: string | null): LibrarySourceFilter {
  return (SET_SOURCES as readonly string[]).includes(value ?? "")
    ? (value as LibrarySourceFilter)
    : "all";
}

/**
 * Library filters live in the URL so they survive reloads and can be shared.
 * The search box keeps local state (instant, IME-safe) and mirrors it to the URL with
 * `history.replaceState`, which syncs `useSearchParams` without a server round trip.
 */
function useLibraryParams() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const filter = {
    query,
    sort: parseSort(searchParams.get("sort")),
    source: parseSource(searchParams.get("source")),
  };
  const writeParam = (key: "q" | "sort" | "source", value: string, defaultValue: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== defaultValue) params.set(key, value);
    else params.delete(key);
    window.history.replaceState(null, "", params.size ? `?${params}` : window.location.pathname);
  };
  const update = (key: "q" | "sort" | "source", value: string, defaultValue: string) => {
    if (key === "q") setQuery(value);
    writeParam(key, value, defaultValue);
  };
  return { filter, update };
}

// Folders need the server backend.
const isHttp = process.env.NEXT_PUBLIC_DATA_SOURCE === "http";

export function LibraryView() {
  const t = useTranslations("library");
  const tSources = useTranslations("sources");
  const tNav = useTranslations("nav");
  const { data: sets, isPending, isError, error, refetch } = useSets();
  const { filter, update } = useLibraryParams();
  const [tab, setTab] = useLibraryTab();
  const visible = useMemo(() => filterAndSortSets(sets ?? [], filter), [sets, filter]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title font-extrabold">{t("title")}</h1>
          {sets ? <p className="mt-1 text-muted">{t("count", { count: sets.length })}</p> : null}
        </div>
        {isHttp ? (
          <SegmentedControl
            label={t("title")}
            hideLabel
            value={tab}
            onChange={setTab}
            options={[
              { value: "mine", label: t("tabMine") },
              { value: "class", label: t("tabFromClass") },
            ]}
          />
        ) : null}
        <div className="flex flex-wrap gap-3">
          {isHttp ? <NewFolderButton /> : null}
          <Button asChild>
            <Link href="/sets/new">
              <Plus className="size-4" aria-hidden />
              {tNav("createSet")}
            </Link>
          </Button>
        </div>
      </div>

      {isHttp && tab === "class" ? <FromClassLibrary /> : null}
      <div
        hidden={isHttp && tab === "class"}
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={filter.query}
            onChange={(event) => update("q", event.target.value, "")}
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full rounded-md border border-border bg-surface-2 pr-3 pl-10 placeholder:text-subtle focus:border-primary focus:bg-surface focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select
            aria-label={t("filterLabel")}
            value={filter.source}
            onChange={(event) => update("source", event.target.value, "all")}
          >
            <option value="all">
              {t("filterLabel")}: {t("filterAll")}
            </option>
            {SET_SOURCES.map((source) => (
              <option key={source} value={source}>
                {t("filterLabel")}: {tSources(source)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("sortLabel")}
            value={filter.sort}
            onChange={(event) => update("sort", event.target.value, "recent")}
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(SORT_LABEL[sort])}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isHttp && tab === "mine" ? <FolderDropBar /> : null}
      {isHttp && tab === "class" ? null : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : sets.length === 0 ? (
        <EmptyState icon={<Library aria-hidden />} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden />}
          title={t("noResults", { query: filter.query })}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((set) => (
            <li
              key={set.id}
              className="flex"
              draggable={isHttp}
              onDragStart={isHttp ? dragSet(set.id) : undefined}
            >
              <SetCard set={set} className="flex-1" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
