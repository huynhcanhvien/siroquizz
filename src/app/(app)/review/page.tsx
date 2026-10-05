import { ReviewQueue } from "@/features/srs/components/ReviewQueue";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder } = await searchParams;
  // Only a well-formed id narrows the queue; anything else shows every set.
  const folderId = folder && /^[0-9a-f-]{36}$/i.test(folder) ? folder : undefined;
  return <ReviewQueue key={folderId ?? "all"} folderId={folderId} />;
}
