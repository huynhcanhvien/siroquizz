"use client";

import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import { useItemShares, useShareToClass, useUnshare } from "../hooks";
import type { ItemShare, LibraryAudience, LibraryItemType } from "../schemas";

interface ShareToClassPanelProps {
  itemType: LibraryItemType;
  itemId: string;
}

function ShareRow({ share, itemType, itemId }: { share: ItemShare } & ShareToClassPanelProps) {
  const t = useTranslations("classes.library");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const shareTo = useShareToClass();
  const unshare = useUnshare();
  const busy = shareTo.isPending || unshare.isPending;
  const onError = (error: unknown) => toast(errorMessage(error), "error");
  const save = (audience: LibraryAudience) =>
    shareTo.mutate(
      { classId: share.classId, itemType, itemId, audience },
      { onSuccess: () => toast(t("shared")), onError },
    );
  const toggle = (on: boolean) => {
    if (on) return save(share.audience ?? "class");
    if (share.libraryItemId)
      unshare.mutate(
        { classId: share.classId, libraryItemId: share.libraryItemId },
        { onSuccess: () => toast(t("removed")), onError },
      );
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <Switch
        checked={Boolean(share.libraryItemId)}
        onCheckedChange={toggle}
        label={share.className}
      />
      <Select
        aria-label={`${t("audience")}: ${share.className}`}
        className="w-auto min-w-36"
        value={share.audience ?? "class"}
        disabled={!share.libraryItemId || busy}
        onChange={(event) => save(event.target.value as LibraryAudience)}
      >
        <option value="class">{t("audienceClass")}</option>
        <option value="teachers">{t("audienceTeachers")}</option>
      </Select>
    </li>
  );
}

/** Turns sharing of one set or folder on/off per class, with who in the class may see it. */
export function ShareToClassPanel({ itemType, itemId }: ShareToClassPanelProps) {
  const t = useTranslations("community.classShare");
  const shares = useItemShares(itemType, itemId);
  if (shares.isPending) return <Skeleton className="h-24" />;
  if (shares.isError) return <QueryError error={shares.error} onRetry={() => shares.refetch()} />;
  if (!shares.data.length) return <p className="text-sm text-muted">{t("none")}</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{t("hint")}</p>
      <ul className="divide-y divide-border">
        {shares.data.map((share) => (
          <ShareRow key={share.classId} share={share} itemType={itemType} itemId={itemId} />
        ))}
      </ul>
    </div>
  );
}
