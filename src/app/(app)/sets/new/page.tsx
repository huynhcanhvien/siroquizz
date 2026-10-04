import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SetEditor } from "@/features/sets/components/SetEditor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("editor");
  return { title: t("createTitle") };
}

export default async function NewSetPage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const { import: openImport } = await searchParams;
  return <SetEditor openImportOnMount={openImport === "1"} />;
}
