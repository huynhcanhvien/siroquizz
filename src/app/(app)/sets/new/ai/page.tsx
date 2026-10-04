import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiGenerator } from "@/features/ai-generate/components/AiGenerator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ai");
  return { title: t("title") };
}

export default function AiGeneratePage() {
  return <AiGenerator />;
}
