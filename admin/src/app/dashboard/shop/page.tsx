import { redirect } from "next/navigation";
import { ShopSettings } from "@/components/admin/shop-settings";
import { currentUser } from "@/lib/builder/current-user";
import { readProject } from "@/lib/builder/server";

export default async function ShopPage() {
  const user = await currentUser();
  if (user.role !== "super-admin") redirect("/dashboard");
  const project = await readProject();
  if (!project.store?.enabled) redirect("/dashboard/settings/project");
  return <ShopSettings />;
}
