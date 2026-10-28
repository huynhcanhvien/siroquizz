"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Globe, Link2, Lock, RefreshCw, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/fields";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { setKeys } from "@/features/sets/hooks";
import { setSharingSchema } from "@/features/sets/schemas";
import { cn } from "@/lib/cn";
import { createHttpClient } from "@/lib/http-client";
import type { SetSharing, SetVisibility, StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { ShareToClassPanel } from "@/features/class-library/components/ShareToClassPanel";

const client = createHttpClient();
const VISIBILITY_ICONS = { private: Lock, unlisted: Link2, public: Globe } as const;
export const publicUrl = (slug: string) => `${window.location.origin}/s/${slug}`;

/** Draws the share link as a QR code; the library loads only when the dialog shows a link. */
function QrCode({ url }: { url: string }) {
  const t = useTranslations("community");
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void import("qrcode").then((qr) =>
      qr.toDataURL(url, { margin: 1, width: 176 }).then((data) => active && setSrc(data)),
    );
    return () => {
      active = false;
    };
  }, [url]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise
    <img src={src} alt={t("qrAlt")} width={176} height={176} className="rounded-lg bg-white p-2" />
  ) : (
    <span className="size-44 animate-pulse rounded-lg bg-surface-3" aria-hidden />
  );
}

function ModerationNotice({
  sharing,
  onRetry,
  retrying,
}: {
  sharing: SetSharing;
  onRetry: () => void;
  retrying: boolean;
}) {
  const t = useTranslations("community");
  if (sharing.hidden)
    return (
      <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
        {t("hidden")}
      </p>
    );
  if (sharing.visibility !== "public" || sharing.moderationStatus === "none") return null;
  const status = sharing.moderationStatus;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold",
        status === "approved" && "bg-success-soft text-success",
        status === "pending" && "bg-accent-soft text-accent-text",
        (status === "flagged" || status === "rejected") && "bg-danger-soft text-danger",
      )}
    >
      <span>{t(`moderation.${status}`, { reason: sharing.moderationReason ?? "" })}</span>
      {status === "pending" ? (
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn("size-4", retrying && "animate-spin")} aria-hidden />
          {t("retryModeration")}
        </Button>
      ) : null}
    </div>
  );
}

/** Up to five topic tags that help people find a public set on Explore. */
function TagsEditor({
  setId,
  tags,
  onSaved,
}: {
  setId: string;
  tags: string[];
  onSaved: (sharing: SetSharing) => void;
}) {
  const t = useTranslations("community");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const id = useId();
  const [value, setValue] = useState(tags.join(", "));
  const save = useMutation({
    mutationFn: async () =>
      (
        await client.request(`/api/v1/sets/${setId}/tags`, setSharingSchema, {
          method: "PATCH",
          body: { tags: value.split(",") },
        })
      ).data,
    onSuccess: (next) => {
      onSaved(next);
      setValue(next.tags.join(", "));
      toast(t("tagsSaved"));
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("tags")}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          maxLength={150}
          placeholder={t("tagsPlaceholder")}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
          {t("tagsSave")}
        </Button>
      </div>
      <p className="text-xs text-muted">{t("tagsHint")}</p>
    </div>
  );
}

/** Chooses who can see a set and hands out its link. */
export function ShareDialog({ set }: { set: StudySet }) {
  const t = useTranslations("community");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const linkId = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"link" | "classes">("link");
  const sharing: SetSharing = set.sharing ?? {
    visibility: "private",
    tags: [],
    slug: null,
    moderationStatus: "none",
    moderationReason: null,
    hidden: false,
  };
  const store = (next: SetSharing) =>
    queryClient.setQueryData<StudySet>(setKeys.detail(set.id), (current) =>
      current ? { ...current, sharing: next } : current,
    );
  const change = useMutation({
    mutationFn: async (visibility: SetVisibility) =>
      (
        await client.request(`/api/v1/sets/${set.id}/visibility`, setSharingSchema, {
          method: "PATCH",
          body: { visibility },
        })
      ).data,
    onSuccess: (next) => {
      store(next);
      toast(t("saved"));
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });
  const retry = useMutation({
    mutationFn: async () =>
      (
        await client.request(`/api/v1/sets/${set.id}/moderation`, setSharingSchema, {
          method: "POST",
          body: {},
        })
      ).data,
    onSuccess: store,
    onError: (error) => toast(errorMessage(error), "error"),
  });
  const url = sharing.slug && sharing.visibility !== "private" ? publicUrl(sharing.slug) : null;
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast(t("linkCopied"));
  };
  const Icon = VISIBILITY_ICONS[sharing.visibility];

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="size-4" aria-hidden />
        {t("share")}
        <Icon
          className="size-3.5 text-muted"
          aria-label={t(`visibilityOptions.${sharing.visibility}`)}
        />
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("shareTitle")}>
        <div className="flex flex-col gap-5">
          <SegmentedControl
            label={t("shareTitle")}
            hideLabel
            value={tab}
            onChange={setTab}
            options={(["link", "classes"] as const).map((value) => ({
              value,
              label: t(`shareTabs.${value}`),
            }))}
          />
          {tab === "classes" ? <ShareToClassPanel itemType="set" itemId={set.id} /> : null}
        </div>
        <div className={cn("mt-5 flex flex-col gap-5", tab !== "link" && "hidden")}>
          <SegmentedControl
            label={t("visibility")}
            value={sharing.visibility}
            onChange={(visibility) => change.mutate(visibility)}
            options={(["private", "unlisted", "public"] as const).map((value) => {
              const OptionIcon = VISIBILITY_ICONS[value];
              return {
                value,
                label: t(`visibilityOptions.${value}`),
                icon: <OptionIcon className="size-4" aria-hidden />,
              };
            })}
          />
          <p className="text-sm text-muted">{t(`visibilityHints.${sharing.visibility}`)}</p>
          <ModerationNotice
            sharing={sharing}
            onRetry={() => retry.mutate()}
            retrying={retry.isPending}
          />
          {sharing.visibility === "public" ? (
            <TagsEditor
              key={sharing.tags.join()}
              setId={set.id}
              tags={sharing.tags}
              onSaved={store}
            />
          ) : null}
          {url ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
              <QrCode url={url} />
              <div className="flex w-full min-w-0 flex-col gap-2">
                <Label htmlFor={linkId}>{t("link")}</Label>
                <Input
                  id={linkId}
                  readOnly
                  value={url}
                  onFocus={(event) => event.target.select()}
                />
                <Button onClick={copy} className="self-start">
                  <Copy className="size-4" aria-hidden />
                  {t("copyLink")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
