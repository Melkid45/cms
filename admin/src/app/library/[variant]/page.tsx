import { notFound } from "next/navigation";
import { definition, createSection } from "@/lib/builder/catalog";
import { seedProject } from "@/lib/builder/seed";
import { SiteCanvas } from "@/components/builder/site-canvas";
import "@/components/builder/site.scss";
export default async function LibraryPreview({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  if (!definition(variant)) notFound();
  return (
    <SiteCanvas
      project={seedProject()}
      sections={[createSection(variant, variant)]}
      layout={false}
    />
  );
}
