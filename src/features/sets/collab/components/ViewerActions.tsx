"use client";

import { Copy, GitPullRequestArrow, Pencil, School } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { SetAccess, StudySet } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { useDuplicateSet } from "../../hooks";

/** "Shared in class X by Y" on a set someone else owns, linking to the class. */
export function SharedInBadge({ sharedIn }: { sharedIn: NonNullable<SetAccess["sharedIn"]> }) {
  const t = useTranslations("collab");
  return (
    <Link
      href={`/classes/${sharedIn.classId}`}
      className="inline-flex items-center gap-2 self-start rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary-text hover:underline"
    >
      <School className="size-4" aria-hidden />
      {t("sharedIn", { class: sharedIn.className, name: sharedIn.sharedByName })}
    </Link>
  );
}

/** What someone who does not own the set can do: edit (collaborator) or suggest, and copy it. */
export function ViewerActions({ set, access }: { set: StudySet; access: SetAccess }) {
  const t = useTranslations("collab");
  const tSet = useTranslations("set");
  const router = useRouter();
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const duplicate = useDuplicateSet();
  const classQuery = access.sharedIn ? `?class=${access.sharedIn.classId}` : "";
  const copy = () =>
    duplicate.mutate(
      { id: set.id, title: set.title },
      {
        onSuccess: (created) => {
          toast(tSet("duplicated"));
          router.push(`/sets/${created.id}`);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {access.canEdit ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/sets/${set.id}/edit`}>
            <Pencil className="size-4" aria-hidden />
            {t("edit")}
          </Link>
        </Button>
      ) : access.acceptsContributions && access.canPropose !== false ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/sets/${set.id}/propose${classQuery}`}>
            <GitPullRequestArrow className="size-4" aria-hidden />
            {t("propose")}
          </Link>
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" loading={duplicate.isPending} onClick={copy}>
        <Copy className="size-4" aria-hidden />
        {t("copyToLibrary")}
      </Button>
    </div>
  );
}
