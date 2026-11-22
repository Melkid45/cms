import { redirect } from "next/navigation";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
export const dynamic = "force-dynamic";
export default async function Home() {
  const project = publicProject(await readProject());
  const home = project.pages.find(
    (page) => page.id === project.layout.homePageId,
  );
  redirect(home ? `/site/${home.slug}` : "/login");
}
