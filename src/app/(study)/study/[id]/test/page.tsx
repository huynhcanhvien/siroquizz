"use client";

import { StudyPage } from "@/features/study/components/StudyPage";
import { TestMode } from "@/features/test/components/TestMode";

export default function TestPage() {
  return <StudyPage mode="test">{(set) => <TestMode set={set} />}</StudyPage>;
}
