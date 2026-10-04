"use client";

import { GamesHub } from "@/features/games/components/GamesHub";
import { StudyPage } from "@/features/study/components/StudyPage";

export default function GamesPage() {
  return <StudyPage mode="games">{(set) => <GamesHub set={set} />}</StudyPage>;
}
