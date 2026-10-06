"use client";

import { useEffect } from "react";
import { useAiGeneration } from "../AiGenerationProvider";

/** Mounted on signed-in pages: picks up a generation left unfinished by an earlier page load. */
export function ResumeAiJob() {
  const { resumeOpenJob } = useAiGeneration();
  useEffect(() => {
    void resumeOpenJob();
    // Once per mount; the provider also guards against checking twice in one page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
