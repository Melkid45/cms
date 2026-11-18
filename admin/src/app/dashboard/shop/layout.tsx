import "@/components/builder/cart.scss";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/builder/current-user";
import { readProject } from "@/lib/builder/server";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();
  if (!(await readProject()).store?.enabled)
    redirect("/dashboard/settings/project");
  return (
    <div>
      <nav
        aria-label="Shop navigation"
        className="mb-7 flex gap-6 border-b pb-4 text-sm"
      >
        <Link className="font-medium hover:underline" href="/dashboard/shop">
          Products
        </Link>
        <Link
          className="font-medium hover:underline"
          href="/dashboard/shop/settings"
        >
          Storefront settings
        </Link>
      </nav>
      {children}
    </div>
  );
}
