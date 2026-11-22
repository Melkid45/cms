import { notFound } from "next/navigation";
import { definition, createSection } from "@/lib/builder/catalog";
import { seedProject } from "@/lib/builder/seed";
import { SiteCanvas } from "@/components/builder/site-canvas";
import { requireSuperAdmin } from "@/lib/builder/current-user";
import "@/components/builder/site.scss";
export const metadata = { robots: { index: false, follow: false } };
export default async function LibraryPreview({
  params,
  searchParams,
}: {
  params: Promise<{ variant: string }>;
  searchParams: Promise<{ stress?: string }>;
}) {
  const { variant } = await params;
  const entry = definition(variant);
  if (!entry) notFound();
  const section = createSection(variant, variant);
  if ((await searchParams).stress === "1") {
    await requireSuperAdmin();
    for (const field of entry.fields) {
      if (field.type === "heading")
        section.values[field.key] =
          "Considered spaces for people, ideas and everyday life";
      if (field.type === "text")
        section.values[field.key] =
          "Thoughtful details bring people together. ".repeat(5) +
          "LongUnbrokenClientContent".repeat(4);
    }
  }
  return (
    <SiteCanvas project={seedProject()} sections={[section]} layout={false} />
  );
}
