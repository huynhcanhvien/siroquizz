"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/fields";
import { Surface } from "@/components/ui/misc";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";

const client = createHttpClient();
const settingsSchema = z.object({
  username: z.string().nullable(),
  profilePublic: z.boolean(),
  nextUsernameChangeAt: z.string().nullable(),
});
type Settings = z.infer<typeof settingsSchema>;
const key = ["me", "profile"] as const;

function ProfileForm({ settings }: { settings: Settings }) {
  const t = useTranslations("community.profileSettings");
  const format = useFormatter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const usernameId = useId();
  const [username, setUsername] = useState(settings.username ?? "");
  const [profilePublic, setProfilePublic] = useState(settings.profilePublic);
  const locked = Boolean(settings.nextUsernameChangeAt);
  const save = useMutation({
    mutationFn: async () =>
      (
        await client.request("/api/v1/me/profile", settingsSchema, {
          method: "PATCH",
          body: {
            profilePublic,
            ...(username && username !== settings.username ? { username } : {}),
          },
        })
      ).data,
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      toast(t("saved"));
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={usernameId}>{t("username")}</Label>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted" aria-hidden>
            @
          </span>
          <Input
            id={usernameId}
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            pattern="[a-z0-9_]{3,20}"
            minLength={3}
            maxLength={20}
            autoComplete="off"
            disabled={locked}
            aria-describedby={`${usernameId}-hint`}
          />
        </div>
        <p id={`${usernameId}-hint`} className="text-sm text-muted">
          {locked
            ? t("nextChange", {
                date: format.dateTime(new Date(settings.nextUsernameChangeAt!), {
                  dateStyle: "medium",
                }),
              })
            : t("usernameHint")}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Switch checked={profilePublic} onCheckedChange={setProfilePublic} label={t("public")} />
        <p className="text-sm text-muted">{t("publicHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t("save")}
        </Button>
        {settings.username ? (
          <Button asChild variant="secondary">
            <Link href={`/u/${settings.username}`}>
              <ExternalLink className="size-4" aria-hidden />
              {t("view")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Username and profile visibility for the public profile page (server-backed mode). */
export function PublicProfileSettings() {
  const t = useTranslations("community.profileSettings");
  const settings = useQuery({
    queryKey: key,
    queryFn: async () => (await client.request("/api/v1/me/profile", settingsSchema)).data,
  });
  return (
    <Surface className="p-5 sm:p-7">
      <h2 className="mb-5 text-lg font-bold">{t("title")}</h2>
      {settings.data ? (
        <ProfileForm key={settings.data.username ?? ""} settings={settings.data} />
      ) : null}
    </Surface>
  );
}
