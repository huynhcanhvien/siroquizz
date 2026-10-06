import { notFound } from "next/navigation";
import { ClassView } from "@/features/classes/components/ClassView";

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  return <ClassView id={(await params).id} />;
}
