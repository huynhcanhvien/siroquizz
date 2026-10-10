"use client";

import { useTranslations } from "next-intl";
import { Label, Select } from "@/components/ui/fields";
import type { Side, StudySet } from "@/lib/types";

export function StudyDirection({
  set,
  answerSide = "definition",
}: {
  set: Pick<StudySet, "termLang" | "definitionLang">;
  answerSide?: Side;
}) {
  const t = useTranslations("contentLanguages");
  const label = useTranslations("learning");
  const from = answerSide === "term" ? set.definitionLang : set.termLang;
  const to = answerSide === "term" ? set.termLang : set.definitionLang;
  return (
    <p className="my-2 text-sm font-semibold text-muted">
      {label("direction")}: {t(from)} → {t(to)}
    </p>
  );
}

export function DirectionSelect({
  set,
  value,
  onChange,
}: {
  set: StudySet;
  value: Side;
  onChange: (side: Side) => void;
}) {
  const t = useTranslations("learning");
  const langs = useTranslations("contentLanguages");
  return (
    <div className="w-full text-left">
      <Label htmlFor="game-direction">{t("direction")}</Label>
      <Select
        id="game-direction"
        value={value}
        onChange={(event) => onChange(event.target.value as Side)}
      >
        <option value="term">
          {langs(set.definitionLang)} → {langs(set.termLang)}
        </option>
        <option value="definition">
          {langs(set.termLang)} → {langs(set.definitionLang)}
        </option>
      </Select>
    </div>
  );
}
