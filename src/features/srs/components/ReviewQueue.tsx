"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { v7 } from "uuid";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { QueryError } from "@/components/ui/QueryState";
import { useToast } from "@/components/ui/Toast";
import { Flashcard } from "@/features/flashcards/components/Flashcard";
import { StudySessionContext } from "@/features/study/session-context";
import type { LangCode } from "@/lib/types";
import { useErrorMessage } from "@/lib/use-messages";
import { useDue, useReview, useSessionRecording } from "../hooks";
import type { dueResponseSchema } from "../schemas";
import { StarButton } from "./StarButton";
// Read the clock outside render so timing stays in effects/handlers, not the render path.
const nowMs = () => Date.now();
function ActiveReview({
  data,
  onFinish,
}: {
  data: z.infer<typeof dueResponseSchema>;
  onFinish: () => void;
}) {
  const t = useTranslations("learning"),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    review = useReview(),
    { toast } = useToast(),
    errorMessage = useErrorMessage(),
    started = useRef(0),
    eventId = useRef(v7()),
    busy = useRef(false),
    card = data.cards[index];
  useEffect(() => {
    started.current = nowMs();
  }, []);
  const rate = async (rating: number) => {
    if (!card || busy.current) return;
    busy.current = true;
    try {
      await review.mutateAsync({
        cardId: card.id,
        rating,
        mode: "review",
        durationMs: Math.min(3600000, nowMs() - started.current),
        eventId: eventId.current,
      });
      setIndex((i) => i + 1);
      setFlipped(false);
      eventId.current = v7();
      started.current = nowMs();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      busy.current = false;
    }
  };
  if (!card)
    return (
      <div className="mx-auto max-w-lg text-center">
        <h2 className="text-2xl font-bold">{t("complete")}</h2>
        <Button className="mt-4" onClick={onFinish}>
          {t("refreshQueue")}
        </Button>
      </div>
    );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <ProgressBar
        value={index}
        max={data.cards.length}
        label={t("reviewProgress", { done: index, total: data.cards.length })}
      />
      <div className="flex items-center justify-between">
        <span className="font-bold">{card.setTitle}</span>
        <StarButton setId={card.setId} cardId={card.id} />
      </div>
      <Flashcard
        card={card}
        frontSide="term"
        flipped={flipped}
        onFlip={() => setFlipped((v) => !v)}
        termLang={card.termLang as LangCode}
        definitionLang={card.definitionLang as LangCode}
        className="h-80"
      />
      {flipped ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([1, 2, 3, 4] as const).map((rating) => (
            <Button
              key={rating}
              variant="secondary"
              disabled={review.isPending}
              onClick={() => void rate(rating)}
            >
              {t(`rating${rating}`)}
            </Button>
          ))}
        </div>
      ) : (
        <Button onClick={() => setFlipped(true)}>{t("showAnswer")}</Button>
      )}
    </div>
  );
}
export function ReviewQueue() {
  const t = useTranslations("learning"),
    [starred, setStarred] = useState(false),
    query = useDue(starred),
    [queue, setQueue] = useState<z.infer<typeof dueResponseSchema> | null>(null),
    count = useSessionRecording(null, "review");
  if (queue)
    return (
      <StudySessionContext.Provider value={count}>
        <ActiveReview
          data={queue}
          onFinish={() => {
            setQueue(null);
            void query.refetch();
          }}
        />
      </StudySessionContext.Provider>
    );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-extrabold">{t("reviewTitle")}</h1>
      <Switch checked={starred} onCheckedChange={setStarred} label={t("onlyStarred")} />
      {query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data?.cards.length ? (
        <section className="rounded-xl border border-border bg-surface p-6">
          <p>{t("dueCount", { count: query.data.totalDue })}</p>
          <p className="mt-2 text-muted">{t("newAllowance", { count: query.data.newRemaining })}</p>
          <Button className="mt-4" onClick={() => setQueue(query.data!)}>
            {t("startReview", { count: query.data.cards.length })}
          </Button>
        </section>
      ) : query.isPending ? (
        <p role="status">{t("loading")}</p>
      ) : (
        <EmptyState icon={<span aria-hidden>✓</span>} title={t("noDue")} />
      )}
    </div>
  );
}
