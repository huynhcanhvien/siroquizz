import { notFound } from "next/navigation";
import { ClassesView } from "@/features/classes/components/ClassesView";

export default function ClassesPage() {
  // Classes live on the server; the offline mock has none.
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  return <ClassesView />;
}
