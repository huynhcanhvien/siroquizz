import { notFound } from "next/navigation";
import { ProposeSet } from "@/features/sets/collab/components/ProposeSet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProposeSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  // Change requests live on the server; the offline mock has none.
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "http") notFound();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const classId = typeof query.class === "string" && UUID.test(query.class) ? query.class : null;
  return <ProposeSet id={id} classId={classId} />;
}
