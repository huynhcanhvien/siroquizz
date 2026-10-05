"use client";

import { useParams } from "next/navigation";
import { FolderStudyFrame } from "@/features/folders/components/FolderStudyFrame";
import { TestMode } from "@/features/test/components/TestMode";

export default function FolderTestPage() {
  const { folderId } = useParams<{ folderId: string }>();
  return (
    <FolderStudyFrame folderId={folderId}>
      {(set) => <TestMode set={set} practice />}
    </FolderStudyFrame>
  );
}
