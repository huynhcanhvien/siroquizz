import { notFound } from "next/navigation";
import { WritingWorkspace } from "@/features/writing/components/WritingWorkspace";

export default async function WritingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  // The study shell has no landmark of its own; the skip link targets #main.
  return (
    <main id="main" className="flex-1 px-4 py-4 sm:px-6 sm:py-6">
      <WritingWorkspace sessionId={(await params).sessionId} />
    </main>
  );
}
