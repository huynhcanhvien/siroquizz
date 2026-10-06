"use client";

import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/fields";
import { creditsForCards } from "../lib/credits";
import { CARD_COUNT_MAX, CARD_COUNT_MIN } from "../lib/generator";
import type { CreditEstimate } from "../schemas";

/**
 * Shows what generating will cost once the document has been read, and lets the user lower the
 * card count until it fits their credits before going ahead.
 */
export function ConfirmEstimate({
  estimate,
  onDecide,
}: {
  estimate: CreditEstimate;
  onDecide: (cardCount: number | null) => void;
}) {
  const t = useTranslations("ai");
  const tCommon = useTranslations("common");
  const countId = useId();
  const [cardCount, setCardCount] = useState(estimate.cardCount);
  const credits = creditsForCards(cardCount);
  const total = credits + estimate.usedCredits;
  const tooLarge = total > estimate.maxJobCredits;
  const notEnough = !tooLarge && total > estimate.quota.available;
  const problem = tooLarge
    ? t("estimateTooLarge", { max: estimate.maxJobCredits })
    : notEnough
      ? t("estimateNotEnough")
      : null;

  return (
    <section
      aria-labelledby="ai-estimate-title"
      className="mx-auto flex w-full max-w-md animate-pop flex-col gap-5 rounded-xl border border-border bg-surface p-8 shadow-lg"
    >
      <span className="grid size-14 place-items-center self-center rounded-2xl bg-accent text-on-accent shadow-[0_4px_0_var(--accent-strong)]">
        <Coins className="size-7" aria-hidden />
      </span>
      <h1 id="ai-estimate-title" className="text-center text-2xl font-extrabold">
        {t("estimateTitle")}
      </h1>
      <p aria-live="polite">{t("estimateIntro", { count: cardCount, credits })}</p>
      {estimate.usedCredits > 0 ? (
        <p className="text-sm text-muted">{t("estimateUsed", { credits: estimate.usedCredits })}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={countId}>{t("estimateCardCount")}</Label>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-sm font-extrabold text-primary-text tabular-nums">
            {cardCount}
          </span>
        </div>
        <input
          id={countId}
          type="range"
          min={CARD_COUNT_MIN}
          max={CARD_COUNT_MAX}
          step={1}
          value={cardCount}
          onChange={(event) => setCardCount(Number(event.target.value))}
          className="w-full cursor-pointer accent-[var(--primary)]"
        />
      </div>
      <p className="text-sm">
        {t("estimateBalance", {
          daily: estimate.quota.dailyRemaining,
          earned: estimate.quota.earned,
        })}
      </p>
      {problem ? (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"
        >
          {problem}
        </p>
      ) : null}
      <p className="text-xs text-muted">{t("estimateHint")}</p>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={() => onDecide(null)}>
          {tCommon("cancel")}
        </Button>
        <Button disabled={Boolean(problem)} onClick={() => onDecide(cardCount)}>
          {t("estimateConfirm", { credits: total })}
        </Button>
      </div>
    </section>
  );
}
