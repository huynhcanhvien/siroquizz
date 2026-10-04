"use client";

import { FlashcardDeck } from "@/features/flashcards/components/FlashcardDeck";
import { StudyPage } from "@/features/study/components/StudyPage";

export default function FlashcardsPage() {
  return <StudyPage mode="flashcards">{(set) => <FlashcardDeck set={set} />}</StudyPage>;
}
