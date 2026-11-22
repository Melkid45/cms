import { notFound } from "next/navigation";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
import { ServicePage } from "@/components/builder/service-page";
import "@/components/builder/site.scss";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = (await readProject()).services?.find(
    (s) => s.slug === slug && s.status === "Published",
  );
  return {
    title: service?.title || "Service not found",
    description: service?.summary,
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = publicProject(await readProject());
  const service = project.services?.find((s) => s.slug === slug);
  if (!service) notFound();
  return <ServicePage project={project} service={service} />;
}
