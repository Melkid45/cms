import { currentUser } from "@/lib/builder/current-user";
import { redirect } from "next/navigation";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await currentUser()).role === "designer")
    redirect("/dashboard/shop/products");
  return children;
}
