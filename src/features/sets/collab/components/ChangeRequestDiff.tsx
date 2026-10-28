"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/misc";
import type { ChangeRequestDetail } from "../schemas";

type CardOp = ChangeRequestDetail["cards"][number];
interface CardText {
  term: string;
  definition: string;
}

function Pair({ card, className }: { card: CardText; className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold">{card.term}</span> — {card.definition}
    </span>
  );
}

function OpRow({ op }: { op: CardOp }) {
  const t = useTranslations("collab");
  if (op.op === "add")
    return (
      <li className="flex flex-wrap items-baseline gap-2 rounded-md bg-success-soft px-3 py-2">
        <Badge tone="success">{t("added")}</Badge>
        <Pair card={op.card} />
      </li>
    );
  if (op.op === "delete")
    return (
      <li className="flex flex-wrap items-baseline gap-2 rounded-md bg-danger-soft px-3 py-2">
        <Badge tone="danger">{t("deleted")}</Badge>
        {op.before ? (
          <del>
            <Pair card={op.before} />
          </del>
        ) : (
          <span className="text-muted">{t("unknownCard")}</span>
        )}
      </li>
    );
  return (
    <li className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2">
      <span className="flex flex-wrap items-baseline gap-2">
        <Badge tone="primary">{t("edited")}</Badge>
        {op.before ? (
          <del className="text-muted">
            <Pair card={op.before} />
          </del>
        ) : (
          <span className="text-muted">{t("unknownCard")}</span>
        )}
      </span>
      <span aria-hidden className="text-subtle">
        ↓
      </span>
      <Pair card={op.card} />
    </li>
  );
}

/** What a change request would do: title/description changes, then each card added, edited or deleted. */
export function ChangeRequestDiff({ request }: { request: ChangeRequestDetail }) {
  const t = useTranslations("collab");
  return (
    <div className="flex flex-col gap-3">
      {request.stale ? (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-sm">
          {t("stale")}
        </p>
      ) : null}
      {request.title !== undefined ? (
        <p className="text-sm font-semibold">{t("titleChange", { title: request.title })}</p>
      ) : null}
      {request.description !== undefined ? (
        <p className="text-sm">{t("descriptionChange", { description: request.description })}</p>
      ) : null}
      <ul className="flex flex-col gap-2 text-sm">
        {request.cards.map((op, index) => (
          <OpRow key={index} op={op} />
        ))}
      </ul>
    </div>
  );
}
