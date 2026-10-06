"use client";

import { useParams } from "next/navigation";
import { FlashcardDeck } from "@/features/flashcards/components/FlashcardDeck";
import { FolderStudyFrame } from "@/features/folders/components/FolderStudyFrame";

export default function FolderFlashcardsPage() {
  const { folderId } = useParams<{ folderId: string }>();
  return (
    <FolderStudyFrame folderId={folderId}>
      {(set) => <FlashcardDeck set={set} practice />}
    </FolderStudyFrame>
  );
}
