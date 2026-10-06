import { notFound } from "next/navigation";
import { FoldersView } from "@/features/folders/components/FoldersView";

export default function FoldersPage() {
  // Folders live on the server; the offline mock has none.
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  return <FoldersView />;
}
