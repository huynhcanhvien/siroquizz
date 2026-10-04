"use client";

import { useParams } from "next/navigation";
import { SetEditor } from "@/features/sets/components/SetEditor";
import { SetLoader } from "@/features/sets/components/SetLoader";

export default function EditSetPage() {
  const { id } = useParams<{ id: string }>();
  return <SetLoader id={id}>{(set) => <SetEditor set={set} />}</SetLoader>;
}
