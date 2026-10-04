"use client";

import { useParams } from "next/navigation";
import { SetLoader } from "@/features/sets/components/SetLoader";
import { SetOverview } from "@/features/sets/components/SetOverview";

export default function SetPage() {
  const { id } = useParams<{ id: string }>();
  return <SetLoader id={id}>{(set) => <SetOverview set={set} />}</SetLoader>;
}
