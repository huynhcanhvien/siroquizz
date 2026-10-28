import { notFound } from "next/navigation";
import { SessionList } from "@/features/writing/components/SessionList";

export default async function ClassWritingPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  return <SessionList classId={(await params).id} />;
}
