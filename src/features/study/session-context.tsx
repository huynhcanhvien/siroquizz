"use client";
import { createContext, useContext } from "react";
export interface SessionCounts {
  cardsSeen: number;
  correct: number;
  incorrect: number;
}
export const StudySessionContext = createContext<((correct: boolean) => void) | null>(null);
export const useCountStudyAnswer = () => useContext(StudySessionContext);
