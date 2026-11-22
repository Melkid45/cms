import Link from "next/link";
import {
  ArrowRight,
  CircleUserRound,
  Globe,
  Globe2,
  KeyRound,
  LucideIcon,
  Megaphone,
  MessageCircle,
  Palette,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Card, CardContent } from "@/components/ui/card";
import { currentUser } from "@/lib/builder/current-user";

interface SettingsItem {
  title: string;
  text: string;
  icon: LucideIcon;
  href: string;
}

const settings = [
  {
    title: "Backups",
    text: "Verified content and media copies, download and restoration",
    icon: Globe,
    href: "/dashboard/settings/backups",
  },
  {
    title: "Website settings",
    text: "Company details, logos, enquiries and email delivery",
    icon: Globe,
    href: "/dashboard/settings/client",
  },
  {
    title: "Forms & hosting",
    text: "Inbox, SMTP delivery and production readiness",
    icon: Globe,
    href: "/dashboard/settings/forms",
  },
  {
    title: "Profile",
    text: "Email, password, avatar, and notifications",
    icon: CircleUserRound,
    href: "/dashboard/settings/profile",
  },
  {
    title: "Project",
    text: "Website, online store, regional settings, and SMTP",
    icon: SlidersHorizontal,
    href: "/dashboard/settings/project",
  },
  {
    title: "Localization",
    text: "Languages and regional formats",
    icon: Globe2,
    href: "#",
  },
  {
    title: "API tokens",
    text: "Access keys for external applications",
    icon: KeyRound,
    href: "#",
  },
  {
    title: "Brand",
    text: "Logo and website color palette",
    icon: Globe,
    href: "/dashboard/settings/setup",
  },
  {
    title: "Website style",
    text: "Custom CSS: same blocks, a unique look for this website",
    icon: Palette,
    href: "/dashboard/settings/style",
  },
  {
    title: "Shop cart",
    text: "Cart window layout and the header cart button",
    icon: ShoppingCart,
    href: "/dashboard/settings/cart",
  },
  {
    title: "Social accounts",
    text: "Facebook Page, Instagram and TikTok for one-click posts",
    icon: Megaphone,
    href: "/dashboard/settings/social",
  },
] satisfies readonly SettingsItem[];
// Custom domain: every role that can open the website (client, designer, super admin).
const domainSettings: SettingsItem = {
  title: "Domain",
  text: "Open the website on your own domain, e.g. zcena.com, with HTTPS",
  icon: Globe2,
  href: "/dashboard/settings/domain",
};
const crmSettings: SettingsItem = {
  title: "CRM & Telegram",
  text: "Notifications to your Telegram, pipeline stages, deals from enquiries",
  icon: MessageCircle,
  href: "/dashboard/settings/crm",
};

export default async function SettingsPage() {
  const user = await currentUser();
  // Designers: the design screens; clients: their website settings only.
  const designer = [
    "/dashboard/settings/style",
    "/dashboard/settings/cart",
    "/dashboard/settings/setup",
    "/dashboard/settings/project",
  ];
  const visible =
    user.role === "super-admin"
      ? [...settings, domainSettings, crmSettings]
      : user.role === "designer"
        ? [...settings.filter((item) => designer.includes(item.href)), domainSettings]
        : [
            {
              title: "Website settings",
              text: "Company details, logos, enquiries and email delivery",
              icon: Globe,
              href: "/dashboard/settings/client",
            },
            domainSettings,
            crmSettings,
          ];
  return (
    <AdminPanel
      title="Settings"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map(({ title, text, icon: Icon, href }) => (
          <Link href={href} key={title}>
            <Card className="group shadow-none transition-colors hover:border-black">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid size-10 place-items-center rounded-md bg-neutral-100">
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-1 block text-xs text-neutral-400">
                    {text}
                  </span>
                </span>
                <ArrowRight className="size-4 text-neutral-300 group-hover:text-black" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AdminPanel>
  );
}
