import { notFound } from "next/navigation";
import { FolderView } from "@/features/folders/components/FolderView";

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  return <FolderView id={(await params).id} />;
}
