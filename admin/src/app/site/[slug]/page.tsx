import { notFound } from "next/navigation";
import { readProject } from "@/lib/builder/server";
import { SiteCanvas } from "@/components/builder/site-canvas";
import { publicProject } from "@/lib/builder/workflows";
import "@/components/builder/site.scss";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = publicProject(await readProject()).pages.find(
    (p) => p.slug === slug && p.status === "Published",
  );
  return page
    ? {
        title: { absolute: page.seo.title || page.title },
        description: page.seo.description,
        keywords: page.seo.keywords,
        robots: { index: !page.seo.noindex, follow: true },
        openGraph: {
          title: page.seo.title || page.title,
          description: page.seo.description,
          images: page.seo.image ? [page.seo.image] : [],
        },
      }
    : { title: "Page not found" };
}
export default async function PublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = publicProject(await readProject());
  const page = project.pages.find(
    (p) => p.slug === slug && p.status === "Published",
  );
  if (!page) notFound();
  return (
    <SiteCanvas project={project} sections={page.sections} pageId={page.id} />
  );
}
