import { notFound } from "next/navigation";
import { JoinClass } from "@/features/classes/components/JoinClass";

/** Invite link target: confirms before joining, so a link alone never enrols anyone. */
export default async function JoinClassPage({ params }: { params: Promise<{ code: string }> }) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) notFound();
  return <JoinClass code={code} />;
}
