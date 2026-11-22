import { readProject } from "@/lib/builder/server";
export async function generateMetadata() {
  const project = await readProject();
  return {
    title: {
      default: project.brand.name,
      template: `%s — ${project.brand.name}`,
    },
    description: "",
  };
}
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
