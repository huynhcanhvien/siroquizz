"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Label, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/Toast";
import { useFolders } from "@/features/folders/hooks";
import { useSets } from "@/features/sets/hooks";
import { useErrorMessage } from "@/lib/use-messages";
import { useShareToClass } from "../hooks";
import type { LibraryAudience, LibraryItemType } from "../schemas";

interface ShareItemToClassDialogProps {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** From a class page: pick one of my sets or folders and who in the class may see it. */
export function ShareItemToClassDialog({
  classId,
  open,
  onOpenChange,
}: ShareItemToClassDialogProps) {
  const t = useTranslations("classes.library");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const errorMessage = useErrorMessage();
  const sets = useSets();
  const folders = useFolders();
  const share = useShareToClass();
  const itemId = useId();
  const audienceId = useId();
  const [choice, setChoice] = useState("");
  const [audience, setAudience] = useState<LibraryAudience>("class");
  const options = [
    ...(sets.data ?? []).map((set) => ({ value: `set:${set.id}`, label: set.title, group: "set" })),
    ...(folders.data ?? []).map((f) => ({
      value: `folder:${f.id}`,
      label: f.name,
      group: "folder",
    })),
  ];
  const submit = () => {
    const [itemType, id] = choice.split(":") as [LibraryItemType, string];
    share.mutate(
      { classId, itemType, itemId: id, audience },
      {
        onSuccess: () => {
          toast(t("shared"));
          setChoice("");
          onOpenChange(false);
        },
        onError: (error) => toast(errorMessage(error), "error"),
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("shareItem")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={submit} disabled={!choice} loading={share.isPending}>
            {t("share")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={itemId}>{t("chooseItem")}</Label>
          <Select id={itemId} value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">{options.length ? "—" : t("noItems")}</option>
            {(["set", "folder"] as const).map((group) => (
              <optgroup key={group} label={t(group === "set" ? "setItem" : "folderItem")}>
                {options
                  .filter((option) => option.group === group)
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={audienceId}>{t("audience")}</Label>
          <Select
            id={audienceId}
            value={audience}
            onChange={(event) => setAudience(event.target.value as LibraryAudience)}
          >
            <option value="class">{t("audienceClass")}</option>
            <option value="teachers">{t("audienceTeachers")}</option>
          </Select>
        </div>
      </div>
    </Dialog>
  );
}
