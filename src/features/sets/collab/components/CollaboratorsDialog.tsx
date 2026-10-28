"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useErrorMessage } from "@/lib/use-messages";
import {
  useAcceptsContributions,
  useCollaboratorAction,
  useCollaborators,
  type Principal,
} from "../hooks";

interface CollaboratorsDialogProps {
  setId: string;
  acceptsContributions: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CandidateList({ setId }: { setId: string }) {
  const t = useTranslations("collab");
  const tClasses = useTranslations("classes");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const candidates = useCollaborators(setId);
  const action = useCollaboratorAction(setId);
  const set = (principal: Principal, grant: boolean) =>
    action.mutate(
      { ...principal, grant },
      { onSuccess: () => toast(t("saved")), onError: (e) => toast(errorMessage(e), "error") },
    );
  if (candidates.isPending) return <Skeleton className="h-24" />;
  if (candidates.isError)
    return <QueryError error={candidates.error} onRetry={() => candidates.refetch()} />;
  if (!candidates.data.classes.length)
    return <p className="text-sm text-muted">{t("noClasses")}</p>;
  return (
    <div className="flex flex-col gap-5">
      {candidates.data.classes.map((klass) => (
        <fieldset key={klass.classId} className="flex flex-col gap-2.5">
          <legend className="mb-1 font-bold">{klass.className}</legend>
          <Switch
            checked={klass.teachersGranted}
            label={t("allTeachers")}
            onCheckedChange={(grant) =>
              set({ principalType: "class_teachers", principalId: klass.classId }, grant)
            }
          />
          {klass.members.map((member) => (
            <Checkbox
              key={member.userId}
              checked={member.granted}
              disabled={action.isPending}
              label={`${member.name} · ${tClasses(`roles.${member.role}`)}`}
              onChange={(event) =>
                set({ principalType: "user", principalId: member.userId }, event.target.checked)
              }
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** Owner settings: who edits directly, and whether others may send suggestions. */
export function CollaboratorsDialog({
  setId,
  acceptsContributions,
  open,
  onOpenChange,
}: CollaboratorsDialogProps) {
  const t = useTranslations("collab");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const contributions = useAcceptsContributions(setId);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("collaboratorsTitle")}
      description={t("collaboratorsHint")}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-4">
          <Switch
            checked={acceptsContributions}
            label={t("acceptContributions")}
            onCheckedChange={(accepts) =>
              contributions.mutate(accepts, {
                onSuccess: () => toast(t("saved")),
                onError: (error) => toast(errorMessage(error), "error"),
              })
            }
          />
          <p className="text-sm text-muted">{t("acceptContributionsHint")}</p>
        </div>
        {open ? <CandidateList setId={setId} /> : null}
      </div>
    </Dialog>
  );
}
