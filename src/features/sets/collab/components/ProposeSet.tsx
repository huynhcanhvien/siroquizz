"use client";

import { SetEditor } from "../../components/SetEditor";
import { SetLoader } from "../../components/SetLoader";

/** The editor in propose mode for a set someone else owns. */
export function ProposeSet({ id, classId }: { id: string; classId: string | null }) {
  return (
    <SetLoader id={id}>
      {(set) => <SetEditor set={set} mode="propose" classId={classId} />}
    </SetLoader>
  );
}
