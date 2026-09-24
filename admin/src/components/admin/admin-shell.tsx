"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CircleUserRound,
  ExternalLink,
  FileText,
  FolderKanban,
  Gauge,
  ImageIcon,
  LayoutGrid,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const primaryNav = [
  { label: "Overview", href: "/dashboard", icon: Gauge, exact: true },
  { label: "Pages", href: "/dashboard/pages", icon: LayoutGrid },
  { label: "Content", href: "/dashboard/content", icon: FileText },
  { label: "Media library", href: "/dashboard/media", icon: ImageIcon },
];

const systemNav = [
  { label: "Team", href: "/dashboard/team", icon: Users },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

const pageNames: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/pages": "Pages",
  "/dashboard/content": "Content",
  "/dashboard/media": "Media library",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/profile": "Profile",
};

function NavItem({ item }: { item: (typeof primaryNav)[number] }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        active ? "bg-black font-medium text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-black",
      )}
    >
      <Icon className="size-4" strokeWidth={1.8} />
      {item.label}
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentPage = pageNames[pathname] ?? "Harbstone";

  return (
    <div className="min-h-screen bg-[#f6f6f6]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-neutral-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-[65px] items-center border-b border-neutral-200 px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-md bg-black text-xs font-black text-white">H</span>
            <span>
              <span className="block text-[13px] font-semibold leading-4 tracking-[0.12em]">HARBSTONE</span>
              <span className="block text-[10px] leading-3 text-neutral-400">Content workspace</span>
            </span>
          </Link>
        </div>

        <div className="border-b border-neutral-200 p-4">
          <button className="flex w-full items-center gap-3 rounded-md border border-neutral-200 p-2 text-left hover:bg-neutral-50">
            <span className="grid size-8 shrink-0 place-items-center rounded bg-neutral-100"><FolderKanban className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">Harbstone website</span>
              <span className="block text-[10px] text-neutral-400">Production</span>
            </span>
            <ChevronDown className="size-3.5 text-neutral-400" />
          </button>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto p-4">
          <div>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Project</p>
            <div className="space-y-1">{primaryNav.map((item) => <NavItem key={item.href} item={item} />)}</div>
          </div>
          <div>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Management</p>
            <div className="space-y-1">{systemNav.map((item) => <NavItem key={item.href} item={item} />)}</div>
          </div>
        </nav>

        <div className="border-t border-neutral-200 p-3">
          <Link href="/dashboard/settings/profile" className={cn("flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-neutral-100", pathname === "/dashboard/settings/profile" && "bg-neutral-100")}>
            <Avatar className="size-9"><AvatarFallback className="bg-black text-xs font-semibold text-white">IM</AvatarFallback></Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">Ilya Melman</span>
              <span className="block truncate text-[10px] text-neutral-400">Owner</span>
            </span>
            <CircleUserRound className="size-4 text-neutral-400" />
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard" className="grid size-8 shrink-0 place-items-center rounded-md bg-black text-xs font-black text-white lg:hidden">H</Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] text-neutral-400"><span>Harbstone website</span><span>/</span></div>
                <p className="truncate text-sm font-semibold">{currentPage}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip><TooltipTrigger className="grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-black"><Search className="size-4" /></TooltipTrigger><TooltipContent>Search</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger className="relative grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-black"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-black ring-2 ring-white" /></TooltipTrigger><TooltipContent>Notifications</TooltipContent></Tooltip>
              <Button variant="outline" size="sm" className="ml-2 hidden sm:inline-flex">Open website <ExternalLink data-icon="inline-end" /></Button>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2 lg:hidden">
            {primaryNav.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-xs", active ? "bg-black text-white" : "text-neutral-500")}>{item.label}</Link>;
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
