"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  ChartLine,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Contact,
  ExternalLink,
  FileText,
  Gauge,
  ImageIcon,
  Inbox,
  LogOut,
  Megaphone,
  LayoutGrid,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wand2,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { resetProject, useProject } from "@/lib/builder/client";
import { confirmEditorLeave } from "@/components/builder/use-page-draft";
import { AccessContext } from "./access-context";
import {
  clientRoute,
  designerRoute,
  type Identity,
  type Role,
} from "@/lib/builder/access";
import { NotificationsPanel, useNotifications } from "./notifications-panel";
import { useCrmBadge } from "./crm/use-crm-badge";
import { setCurrentSite } from "@/lib/builder/site-client";
import { sitePath } from "@/lib/builder/site-links";
import { SiteContext, type Workspace } from "./site-context";
import { SitePicker, exitClient, initialsOf } from "./site-switcher";

type NavLink = {
  label: string;
  href: string;
  icon: typeof Gauge;
  exact?: boolean;
  // Roles that see the link in the menu.
  roles: Role[];
};
// Studio items work across all clients; website items need a selected website. The owner
// sees one or the other (studio mode = no website selected); clients and designers
// always have a website, so they see every group their role allows.
type NavGroup = {
  title?: string;
  scope: "studio" | "website";
  items: NavLink[];
};
const everyone: Role[] = ["super-admin", "designer", "client"];
const team: Role[] = ["super-admin", "designer"];
const ownerOnly: Role[] = ["super-admin"];
const navGroups: NavGroup[] = [
  {
    title: "Studio",
    scope: "studio",
    items: [
      {
        // Owner start page: needs attention + companies → websites → client logins.
        label: "Clients",
        href: "/dashboard/clients",
        icon: Building2,
        roles: ownerOnly,
      },
      {
        label: "Orders",
        href: "/dashboard/orders",
        icon: ClipboardList,
        roles: team,
      },
      {
        // Onboarding autopilot across all new websites (lib/builder/onboarding).
        label: "Onboarding",
        href: "/dashboard/onboarding",
        icon: Wand2,
        roles: ownerOnly,
      },
      {
        label: "Billing",
        href: "/dashboard/billing",
        icon: Receipt,
        roles: ownerOnly,
      },
      { label: "Team", href: "/dashboard/team", icon: Users, roles: ownerOnly },
    ],
  },
  {
    scope: "website",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: Gauge,
        exact: true,
        roles: ["client"],
      },
    ],
  },
  {
    title: "Website",
    scope: "website",
    items: [
      {
        // Owner inside a client: rename, websites (Test / Live), client logins, invoices.
        label: "Client",
        href: "/dashboard/client",
        icon: Building2,
        exact: true,
        roles: ownerOnly,
      },
      {
        // Owner: overview of the open website (his /dashboard is the studio).
        label: "Overview",
        href: "/dashboard/website",
        icon: Gauge,
        roles: ownerOnly,
      },
      {
        label: "Pages",
        href: "/dashboard/pages",
        icon: LayoutGrid,
        roles: everyone,
      },
      {
        label: "Layout",
        href: "/dashboard/layout",
        icon: PanelsTopLeft,
        roles: team,
      },
      {
        label: "Section library",
        href: "/dashboard/content",
        icon: FileText,
        roles: team,
      },
      {
        label: "Media library",
        href: "/dashboard/media",
        icon: ImageIcon,
        roles: team,
      },
      {
        // Clients and designers follow their own website's consultation/review.
        label: "Onboarding",
        href: "/dashboard/onboarding",
        icon: Wand2,
        roles: ["designer", "client"],
      },
      {
        // Website settings (domain, forms, backups, style...); account settings = bottom gear.
        label: "Website settings",
        href: "/dashboard/settings",
        icon: Settings,
        roles: everyone,
      },
    ],
  },
  {
    title: "Sales",
    scope: "website",
    items: [
      {
        label: "Inbox",
        href: "/dashboard/submissions",
        icon: Inbox,
        roles: ownerOnly,
      },
      {
        // Orders from a shop website's checkout (not the Harbstone website orders).
        label: "Shop orders",
        href: "/dashboard/shop-orders",
        icon: ShoppingCart,
        roles: ["super-admin", "client"],
      },
      {
        // Products of a shop website: product pages, catalogue grid and cards (lib/builder/products).
        label: "Catalog",
        href: "/dashboard/catalog",
        icon: Package,
        roles: everyone,
      },
      {
        // CRM: contacts, deals, tasks of the website (badge = overdue tasks).
        label: "CRM",
        href: "/dashboard/crm",
        icon: Contact,
        roles: ["super-admin", "client"],
      },
      {
        // Online bookings of the website: calendar, services, staff, hours (lib/builder/booking).
        label: "Bookings",
        href: "/dashboard/bookings",
        icon: CalendarDays,
        roles: ["super-admin", "client"],
      },
    ],
  },
  {
    title: "Marketing",
    scope: "website",
    items: [
      {
        // SEO of the selected website: page checks, business data, redirects (lib/builder/seo).
        label: "SEO",
        href: "/dashboard/seo",
        icon: Search,
        roles: team,
      },
      {
        // Clients: the AI SEO assistant's approval queue (team reaches it from SEO).
        label: "SEO assistant",
        href: "/dashboard/seo/assistant",
        icon: Search,
        roles: ["client"],
      },
      {
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: ChartLine,
        roles: everyone,
      },
      {
        label: "Social posts",
        href: "/dashboard/social",
        icon: Megaphone,
        roles: everyone,
      },
      {
        // Approve / Skip / Edit of what the system prepared (lib/builder/approvals).
        label: "Approvals",
        href: "/dashboard/approvals",
        icon: CheckCheck,
        roles: ["super-admin", "client"],
      },
    ],
  },
];
// Page editor, layout editor and section library keep their panel separator lines.
const editorRoute = (path: string) =>
  path.startsWith("/dashboard/pages/") ||
  path === "/dashboard/layout" ||
  path === "/dashboard/content";
// Owner in studio mode: screens that do not need a selected website.
const studioRoute = (path: string) =>
  path === "/dashboard" ||
  path === "/dashboard/clients" ||
  path.startsWith("/dashboard/orders") ||
  path.startsWith("/dashboard/onboarding") ||
  path === "/dashboard/billing" ||
  path === "/dashboard/team" ||
  path === "/dashboard/settings/profile";
const roleTitle: Record<Role, string> = {
  "super-admin": "Super admin",
  designer: "Designer",
  client: "Client",
};

const pageNames: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/orders": "Orders",
  "/dashboard/onboarding": "Onboarding",
  "/dashboard/clients": "Clients",
  "/dashboard/client": "Client",
  "/dashboard/website": "Website overview",
  "/dashboard/billing": "Billing",
  "/dashboard/team": "Team",
  "/dashboard/settings/style": "Website style",
  "/dashboard/pages": "Pages",
  "/dashboard/pages/new": "Create a page",
  "/dashboard/layout": "Layout",
  "/dashboard/content": "Section library",
  "/dashboard/media": "Media library",
  "/dashboard/submissions": "Inbox",
  "/dashboard/shop-orders": "Shop orders",
  "/dashboard/catalog": "Catalog",
  "/dashboard/catalog/new": "New product",
  "/dashboard/analytics": "Analytics",
  "/dashboard/social": "Social posts",
  "/dashboard/approvals": "Approvals",
  "/dashboard/seo/assistant": "SEO assistant",
  "/dashboard/bookings": "Bookings",
  "/dashboard/crm": "Contacts",
  "/dashboard/crm/pipeline": "Deals",
  "/dashboard/crm/tasks": "Tasks",
  "/dashboard/settings/crm": "CRM settings",
  "/dashboard/settings/social": "Social accounts",
  "/dashboard/settings/forms": "Forms & hosting",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/profile": "Profile",
  "/dashboard/settings/setup": "Brand setup",
  "/dashboard/settings/project": "Project settings",
  "/dashboard/settings/client": "Website settings",
  "/dashboard/settings/backups": "Backups",
  "/dashboard/settings/domain": "Domain",
};

// Sidebar layout follows the Harbstone product design (logo + collapse, project card,
// menu groups with plain headings, icon row at the bottom); link typography stays the CMS one.
function NavItem({
  item,
  collapsed,
  badge = 0,
}: {
  item: NavLink;
  collapsed: boolean;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-neutral-100 font-medium text-black"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-black",
      )}
    >
      <span className="relative">
        <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
        {collapsed && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full bg-red-600 ring-2 ring-white" />
        )}
      </span>
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span
          className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-[18px] text-white"
          aria-label={`${badge} overdue tasks`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

// Collapsed menu state is a per-browser convenience (localStorage), read without hydration mismatch.
const collapsedKey = "cms-sidebar-collapsed";
const collapsedEvent = "cms-sidebar-collapsed-change";
function readCollapsed() {
  try {
    return localStorage.getItem(collapsedKey) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(collapsedKey, value ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(collapsedEvent));
}
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(collapsedEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(collapsedEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const iconButton = (active = false) =>
  cn(
    "relative grid size-10 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black",
    active && "bg-neutral-100 text-black",
  );

export function AdminShell({
  children,
  identity,
  workspace,
}: {
  children: React.ReactNode;
  identity: Identity;
  workspace: Workspace;
}) {
  const site = workspace.site;
  const router = useRouter();
  // The website this tab works on. Runs before child effects, so the first data requests
  // already carry ?site=. If another tab switches the remembered website, this tab takes
  // its own website back instead of sending loaded data to the other one.
  const pinned = useRef("");
  useLayoutEffect(() => {
    if (!site) return;
    if (pinned.current && pinned.current !== site.id) {
      if (workspace.sites.some((item) => item.id === pinned.current)) {
        setCurrentSite(pinned.current);
        router.refresh();
        return;
      }
      resetProject();
    }
    pinned.current = site.id;
    setCurrentSite(site.id);
  }, [site, workspace.sites, router]);
  const { project } = useProject();
  const [showSites, setShowSites] = useState(false);
  const pathname = usePathname();
  const currentPage =
    pageNames[pathname] ??
    (pathname.startsWith("/dashboard/pages/")
      ? "Edit page"
      : pathname.startsWith("/dashboard/catalog/")
        ? "Product"
      : pathname.startsWith("/dashboard/orders/")
        ? "Order"
        : pathname.startsWith("/dashboard/crm/")
          ? "Contact"
          : "Harbstone");
  const [showNotifications, setShowNotifications] = useState(false);
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false,
  );
  const toggleCollapsed = () => writeCollapsed(!collapsed);
  const initials = identity.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
  const projectName = site?.name || project?.brand.name || "Harbstone website";
  const companyName =
    workspace.companies.find((company) => company.id === site?.companyId)
      ?.name || "";
  const websiteHref = sitePath(
    site?.key,
    project?.pages.find((p) => p.id === project.layout.homePageId)?.slug ||
      "home",
  );
  const isOwner = identity.role === "super-admin";
  // Owner without a selected website = studio mode: studio items only, no website card.
  const studio = isOwner && !site;
  const groups = navGroups
    .filter(
      (group) =>
        !isOwner || group.scope === (studio ? "studio" : "website"),
    )
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(identity.role)),
    }))
    .filter((group) => group.items.length > 0);
  const navigation = groups.flatMap((group) => group.items);
  // Websites in the card's switcher: the open client's websites for the owner,
  // all own websites for clients and designers.
  const switchable = workspace.sites.filter(
    (item) => !isOwner || item.companyId === site?.companyId,
  );
  const allowed = studio
    ? studioRoute(pathname)
    : isOwner ||
      (identity.role === "designer"
        ? designerRoute(pathname)
        : clientRoute(pathname));
  // Website screens opened in studio mode go to the clients table instead of
  // silently using the first website.
  useEffect(() => {
    if (studio && !studioRoute(pathname)) router.replace("/dashboard/clients");
  }, [studio, pathname, router]);
  // Owner and designers get team notifications; owner and clients also get CRM
  // notifications of their websites (new enquiry, shop order, task due).
  const notifications = useNotifications(true);
  const crmBadge = useCrmBadge(!!site && identity.role !== "designer");
  return (
    <AccessContext.Provider value={identity}>
      <SiteContext.Provider value={workspace}>
        <div className="min-h-screen bg-[#f0f0f0]">
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-30 hidden bg-white transition-[width] lg:flex lg:flex-col",
              collapsed ? "w-[72px]" : "w-64",
            )}
          >
            <div className="flex h-16 shrink-0 items-center px-3">
              {collapsed ? (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="Expand menu"
                  title="Expand menu"
                  className="group/logo mx-auto grid size-10 place-items-center rounded-lg text-black transition-colors hover:bg-neutral-100"
                >
                  <BrandLogo
                    mark
                    className="h-5 w-auto group-hover/logo:hidden"
                  />
                  <PanelLeftOpen className="hidden size-4 group-hover/logo:block" />
                </button>
              ) : (
                <div className="flex w-full items-center gap-1">
                  <Link
                    href="/dashboard"
                    aria-label="Harbstone"
                    className="flex min-w-0 flex-1 items-center px-2 text-black"
                  >
                    <BrandLogo className="h-6 w-auto max-w-full" />
                  </Link>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label="Collapse menu"
                    title="Collapse menu"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </div>
              )}
            </div>

            {site && (
              <div className="px-3 pb-2">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => exitClient()}
                    title={collapsed ? "All clients" : undefined}
                    aria-label="All clients"
                    className={cn(
                      "mb-1 flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black",
                      collapsed ? "mx-auto w-10 justify-center px-0" : "w-full",
                    )}
                  >
                    <ArrowLeft className="size-4 shrink-0" />
                    {!collapsed && "All clients"}
                  </button>
                )}
                <div className={cn(!collapsed && "flex gap-2")}>
                  <button
                    type="button"
                    disabled={switchable.length < 2}
                    onClick={() => {
                      if (collapsed) writeCollapsed(false);
                      setShowSites(collapsed || !showSites);
                    }}
                    aria-expanded={switchable.length > 1 ? showSites : undefined}
                    title={
                      collapsed
                        ? [companyName, projectName].filter(Boolean).join(" · ")
                        : undefined
                    }
                    className={cn(
                      "flex min-w-0 items-center gap-3 rounded-xl bg-neutral-100 text-left transition-colors enabled:hover:bg-neutral-200/70",
                      collapsed
                        ? "mx-auto size-12 justify-center"
                        : "h-12 flex-1 px-3",
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[11px] font-semibold text-black">
                      {initialsOf(companyName || projectName)}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="min-w-0 flex-1">
                          {companyName && (
                            <span className="block truncate text-[11px] leading-4 text-neutral-500">
                              {companyName}
                            </span>
                          )}
                          <span className="block truncate text-sm font-semibold leading-5">
                            {projectName}
                          </span>
                        </span>
                        {switchable.length > 1 && (
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-neutral-500 transition-transform",
                              showSites && "rotate-180",
                            )}
                          />
                        )}
                      </>
                    )}
                  </button>
                </div>
                {showSites && !collapsed && switchable.length > 1 && (
                  <SitePicker
                    sites={switchable}
                    current={site.id}
                    pathname={pathname}
                    onClose={() => setShowSites(false)}
                  />
                )}
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
              {groups.map((group, index) => (
                <div
                  key={group.title ?? group.items[0].href}
                  className={cn(
                    "space-y-1",
                    index > 0 && (collapsed ? "mt-3" : "mt-5"),
                  )}
                >
                  {group.title && !collapsed && (
                    <p className="px-3 pb-1 text-[13px] font-medium text-neutral-400">
                      {group.title}
                    </p>
                  )}
                  {group.items.map((item) => (
                    <NavItem
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      badge={item.href === "/dashboard/crm" ? crmBadge : 0}
                    />
                  ))}
                </div>
              ))}
            </nav>

            <div
              className={cn(
                "shrink-0 border-t border-neutral-200 bg-white px-3 py-2",
                collapsed
                  ? "grid grid-cols-1 place-items-center gap-1"
                  : "flex items-center justify-around",
              )}
            >
              <Link
                href={
                  isOwner
                    ? "/dashboard/settings/profile"
                    : "/dashboard/settings"
                }
                aria-label={`${identity.name} · Profile`}
                title={`${identity.name} · ${roleTitle[identity.role]}`}
                className={iconButton(
                  pathname === "/dashboard/settings/profile",
                )}
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-black text-[11px] font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Link>
                <button
                  type="button"
                  aria-label={
                    notifications.unread
                      ? `Notifications, ${notifications.unread} unread`
                      : "Notifications"
                  }
                  title="Notifications"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={iconButton(showNotifications)}
                >
                  <Bell className="size-[18px]" />
                  <UnreadBadge count={notifications.unread} />
                </button>
              {isOwner && (
                <Link
                  href="/dashboard/settings/profile"
                  aria-label="Account settings"
                  title="Account settings"
                  className={iconButton(
                    pathname === "/dashboard/settings/profile",
                  )}
                >
                  <Settings className="size-[18px]" />
                </Link>
              )}
              <SignOut />
            </div>
          </aside>

          <div className={collapsed ? "lg:pl-[72px]" : "lg:pl-64"}>
            {/* Desktop has no top bar (Vova, 2026-11-17: redundant); phones keep it for the logo and the nav strip. */}
            <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur lg:hidden">
              <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    href="/dashboard"
                    className="grid size-8 shrink-0 place-items-center rounded-md bg-black text-xs font-black text-white lg:hidden"
                  >
                    H
                  </Link>
                  <div className="min-w-0">
                    {site ? (
                      <button
                        type="button"
                        disabled={!isOwner && switchable.length < 2}
                        onClick={() => setShowSites(!showSites)}
                        aria-expanded={showSites}
                        aria-label="Switch website"
                        className="flex max-w-full items-center gap-1 text-[11px] text-neutral-500"
                      >
                        <span className="truncate">{projectName}</span>
                        {(isOwner || switchable.length > 1) && (
                          <ChevronDown className="size-3 shrink-0" />
                        )}
                      </button>
                    ) : (
                      <p className="text-[11px] text-neutral-500">Studio</p>
                    )}
                    <p className="truncate text-sm font-semibold">
                      {currentPage}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isOwner && (
                    <Tooltip>
                      <TooltipTrigger className="grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-black">
                        <Search className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>Search</TooltipContent>
                    </Tooltip>
                  )}
                    <Tooltip>
                      <TooltipTrigger
                        aria-label="Notifications"
                        className="relative grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-black lg:hidden"
                        onClick={() => setShowNotifications(!showNotifications)}
                      >
                        <Bell className="size-4" />
                        <UnreadBadge count={notifications.unread} />
                      </TooltipTrigger>
                      <TooltipContent>Notifications</TooltipContent>
                    </Tooltip>
                  {site && (
                    <Button
                      nativeButton={false}
                      render={
                        <a href={websiteHref} target="_blank" rel="noreferrer" />
                      }
                      variant="outline"
                      size="sm"
                      className="ml-2 hidden sm:inline-flex"
                    >
                      Open website <ExternalLink data-icon="inline-end" />
                    </Button>
                  )}
                </div>
              </div>
              {showSites && site && (
                <div className="px-4 pb-3 lg:hidden">
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => exitClient()}
                      className="flex h-9 items-center gap-2 text-sm text-neutral-600"
                    >
                      <ArrowLeft className="size-4" /> All clients
                    </button>
                  )}
                  {switchable.length > 1 && (
                    <SitePicker
                      sites={switchable}
                      current={site.id}
                      pathname={pathname}
                      onClose={() => setShowSites(false)}
                    />
                  )}
                </div>
              )}

              <nav className="flex gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2 lg:hidden">
                {navigation.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "whitespace-nowrap rounded-md px-3 py-1.5 text-xs",
                        active ? "bg-black text-white" : "text-neutral-500",
                      )}
                    >
                      {item.label}
                      {item.href === "/dashboard/crm" && crmBadge > 0 && ` · ${crmBadge}`}
                    </Link>
                  );
                })}
              </nav>
            </header>

            <main
              className={cn(
                "admin-surface mx-auto w-full p-4 sm:p-5",
                // Soft row dividers in lists; editors keep their own structural lines.
                !editorRoute(pathname) && "admin-soft-lines",
              )}
            >
              {!site && !isOwner ? (
                <p>
                  No website is assigned to your account yet. Ask your super
                  admin for access.
                </p>
              ) : allowed ? (
                children
              ) : studio ? null : (
                <p>This section is managed by your super admin.</p>
              )}
            </main>
          </div>
        </div>
        {showNotifications && (
          <NotificationsPanel
            state={notifications}
            onClose={() => setShowNotifications(false)}
          />
        )}
      </SiteContext.Provider>
    </AccessContext.Provider>
  );
}
function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}
function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      className={cn(iconButton(), "hover:bg-red-500/10 hover:text-red-600")}
      onClick={async () => {
        if (!confirmEditorLeave()) return;
        const response = await fetch("/api/builder/session", {
          method: "DELETE",
        });
        if (response.ok) {
          router.push("/login");
          router.refresh();
        }
      }}
    >
      <LogOut className="size-[18px]" />
    </button>
  );
}
