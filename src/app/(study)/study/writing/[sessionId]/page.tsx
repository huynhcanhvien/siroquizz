import { notFound } from "next/navigation";
import { WritingWorkspace } from "@/features/writing/components/WritingWorkspace";

export default async function WritingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  return <WritingWorkspace sessionId={(await params).sessionId} />;
}
