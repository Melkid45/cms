import Link from "next/link";
import { ArrowRight, CircleUserRound, Globe2, KeyRound, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";

const settings = [
  { title: "Profile", text: "Email, password, avatar, and notifications", icon: CircleUserRound, href: "/dashboard/settings/profile" },
  { title: "Project", text: "Name, domain, and system preferences", icon: SlidersHorizontal, href: "#" },
  { title: "Localization", text: "Languages and regional formats", icon: Globe2, href: "#" },
  { title: "API tokens", text: "Access keys for external applications", icon: KeyRound, href: "#" },
];

export default function SettingsPage() {
  return (
    <div className="rise-in">
      <PageHeader title="Settings" description="Manage your project, profile, and integrations." />
      <div className="grid gap-3 md:grid-cols-2">
        {settings.map(({ title, text, icon: Icon, href }) => (
          <Link href={href} key={title}>
            <Card className="group shadow-none transition-colors hover:border-black"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-md bg-neutral-100"><Icon className="size-4" /></span><span className="flex-1"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs text-neutral-400">{text}</span></span><ArrowRight className="size-4 text-neutral-300 group-hover:text-black" /></CardContent></Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
