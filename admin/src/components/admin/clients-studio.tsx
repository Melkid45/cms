"use client";
import { Select, SelectOption } from "@/components/ui/select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pin,
  Plus,
  Search,
} from "lucide-react";
import { rowLine } from "./admin-panel";
import { ClientQuickView } from "./client-quick-view";
import {
  StudioStatus,
  clientBilling,
  AddWebsiteDialog,
  IconAction,
  big,
  hasAccess,
  send,
  siteStatus,
} from "./client-manage";
import { useWorkspace } from "./site-context";
import { initialsOf, switchSite } from "./site-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toneClass } from "./status-tone";
import type { StudioAccount, StudioData } from "@/lib/builder/studio";

// Borderless blocks on the tonal page background (Vova, 2026-11-22: no framed boxes).
const card = "rounded-[20px] bg-white";
const pageSize = 20;
// Comfortable controls on this screen (Vova: about 40 px buttons, room to breathe).
// Fields (search, sort) are white with a border; buttons are filled (Vova, 2026-11-22).
const control =
  "h-10 rounded-lg border border-[#e2e2e2] bg-white text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const money = (value: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 ? 2 : 0,
  }).format(value);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
// Soft avatar colour per company, stable across visits.
const tints = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-orange-100 text-orange-800",
];
const tintOf = (id: string) =>
  tints[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % tints.length];

type Sort = "attention" | "name" | "newest" | "activity";
const grid =
  "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_56px_minmax(0,1.2fr)_64px_auto]";

export function ClientsStudio({ data }: { data: StudioData }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const companies = useMemo(() => workspace?.companies ?? [], [workspace]);
  const sites = useMemo(() => workspace?.sites ?? [], [workspace]);
  const current = workspace?.site ?? null;
  const [accounts, setAccounts] = useState(data.accounts);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("attention");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState("");
  const [addSiteFor, setAddSiteFor] = useState("");
  const [adding, setAdding] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const siteName = (id?: string) => {
    const site = sites.find((item) => item.id === id);
    if (!site) return "";
    const company = companies.find((item) => item.id === site.companyId);
    return company && company.name !== site.name
      ? `${company.name} · ${site.name}`
      : site.name;
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = companies.map((company) => {
      const own = sites.filter((site) => site.companyId === company.id);
      const logins = accounts.filter((account) =>
        own.some((site) => hasAccess(account, site)),
      );
      const info = own.map((site) => data.sites[site.id]);
      const text = [
        company.name,
        ...own.flatMap((site) => [
          site.name,
          site.key,
          data.sites[site.id]?.domain ?? "",
        ]),
        ...logins.flatMap((account) => [account.name, account.email]),
      ]
        .join(" ")
        .toLowerCase();
      return {
        company,
        sites: own,
        logins,
        text,
        // Needs attention: overdue and unpaid invoices first, then open website orders
        // and change requests.
        attention: (() => {
          const billing = clientBilling(own, data);
          return (
            billing.overdue * 1000 +
            billing.count * 100 +
            info.reduce(
              (sum, item) =>
                sum +
                (item?.openOrders ?? 0) +
                (item?.openRequests ?? 0) +
                (item?.subscription && item.subscription !== "active" ? 1 : 0),
              0,
            )
          );
        })(),
        last: info.reduce(
          (a, item) => (item && item.updatedAt > a ? item.updatedAt : a),
          company.createdAt,
        ),
      };
    });
    const found = q ? list.filter((row) => row.text.includes(q)) : list;
    const byName = (a: (typeof list)[number], b: (typeof list)[number]) =>
      a.company.name.localeCompare(b.company.name);
    // Pinned clients (the owner's real clients) always come first, then the chosen sort.
    return found.sort((a, b) =>
      Number(!!b.company.pinned) - Number(!!a.company.pinned) ||
      (sort === "newest"
        ? b.company.createdAt.localeCompare(a.company.createdAt)
        : sort === "activity"
          ? b.last.localeCompare(a.last)
          : sort === "attention"
            ? b.attention - a.attention || b.last.localeCompare(a.last)
            : byName(a, b)),
    );
  }, [companies, sites, accounts, data, query, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice(page * pageSize, page * pageSize + pageSize);
  const liveCount = sites.filter((site) => siteStatus(data.sites[site.id]) === "live").length;
  const testCount = sites.filter((site) => siteStatus(data.sites[site.id]) === "test").length;
  const openRow = rows.find((row) => row.company.id === open);
  // Enter a client: lands on its Client page (owner, inside the client).
  const enter = (siteId: string) => switchSite(siteId, "/dashboard/client");

  // Up to five things to act on: orders flagged by the system, new change requests,
  // overdue invoices.
  const actions = [
    ...data.orders
      .filter((order) => order.needsAction)
      .map((order) => ({
        key: order.id,
        href: `/dashboard/orders/${order.id}`,
        title: `Order #${order.number} ${order.name}`,
        meta: order.needsAction!,
        tone: "red" as const,
      })),
    ...data.requests
      .filter((request) => request.status === "new")
      .map((request) => ({
        key: request.id,
        href: "/dashboard/orders?tab=requests",
        title: request.text,
        meta: `Change request · ${siteName(request.siteId)}`,
        tone: "amber" as const,
      })),
    ...data.invoices
      .filter((invoice) => invoice.overdue)
      .map((invoice) => ({
        key: invoice.id,
        href: "/dashboard/billing",
        title: `${invoice.number} · ${money(invoice.amount)}`,
        meta: `Overdue · ${siteName(invoice.siteId)}`,
        tone: "red" as const,
      })),
  ].slice(0, 5);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const saveAccount = (account: StudioAccount) =>
    setAccounts((list) =>
      list.some((item) => item.id === account.id)
        ? list.map((item) => (item.id === account.id ? account : item))
        : [...list, account],
    );

  return (
    <div className="rise-in min-w-0">
      <section className="mb-4 grid grid-cols-2 gap-4 sm:mb-5 sm:gap-5 xl:grid-cols-4">
        <Kpi
          label="Clients"
          value={String(companies.length)}
          note={`${accounts.filter((a) => a.role === "client" && !a.disabled).length} client logins`}
          onClick={() => {
            setQuery("");
            setSort("attention");
            setPage(0);
          }}
        />
        <Kpi
          label="Websites live"
          value={String(liveCount)}
          note={`${testCount} on test address · ${sites.length} websites`}
          onClick={() => {
            setSort("activity");
            setPage(0);
          }}
        />
        <Kpi
          label="Open website orders"
          value={String(data.openOrders)}
          note={
            data.orders.some((order) => order.needsAction)
              ? `${data.orders.filter((order) => order.needsAction).length} need action`
              : `${data.openRequests} change requests`
          }
          alert={data.orders.some((order) => order.needsAction)}
          href="/dashboard/orders"
        />
        <Kpi
          label="Unpaid"
          value={money(data.unpaidTotal)}
          note={
            data.overdueCount
              ? `${data.overdueCount} overdue · ${data.unpaidCount} invoices`
              : `${data.unpaidCount} open invoices`
          }
          alert={data.overdueCount > 0}
          href="/dashboard/billing"
        />
      </section>

      <section id="clients" className={cn(card, "p-5 sm:p-6")}>
        <div className="flex flex-wrap items-center gap-2.5 pb-3">
          {/* No visible block title: the Clients KPI tile already names it (Vova). */}
          <h1 className="sr-only">Clients</h1>
          <label className="relative min-w-0 flex-1 basis-full sm:basis-60">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <Input
              aria-label="Search clients"
              placeholder="Search clients, sites, emails"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              className={cn(control, "w-full pl-9")}
            />
          </label>
          <Select
            aria-label="Sort clients"
            value={String(sort)}
            onValueChange={(selectedValue) => {
              setSort(selectedValue as Sort);
              setPage(0);
            }}
            className="h-9 "
          >
            <SelectOption value="attention">Needs attention</SelectOption>
            <SelectOption value="activity">Recently updated</SelectOption>
            <SelectOption value="name">Name A–Z</SelectOption>
            <SelectOption value="newest">Newest first</SelectOption>
          </Select>
          <Button
            variant="outline"
            className={big}
            onClick={() => setShowActions(!showActions)}
            aria-expanded={showActions}
          >
            Needs action
            {actions.length > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 text-[11px] leading-[18px] font-semibold text-white">
                {actions.length}
              </span>
            )}
          </Button>
          <Button className={big} onClick={() => setAdding(!adding)}>
            <Plus /> Add client
          </Button>
        </div>

        {showActions && (
          <div className="mb-3 rounded-lg bg-neutral-50 p-2">
            {actions.length ? (
              actions.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex min-w-0 items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-white"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      item.tone === "red" ? "bg-red-500" : "bg-amber-400",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.title}
                  </span>
                  <span className="hidden max-w-[45%] truncate text-[13px] text-neutral-500 sm:block">
                    {item.meta}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2.5 py-1.5 text-sm text-neutral-500">
                Nothing needs action right now.
              </p>
            )}
            {data.unreadNotifications > 0 && (
              <p className="px-2.5 pt-1 text-xs text-neutral-500">
                {data.unreadNotifications} unread notifications in the bell
                menu.
              </p>
            )}
          </div>
        )}

        {adding && (
          <form
            className="mb-3 flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("name"));
              run(async () => {
                const company = await send("/api/builder/sites", "POST", {
                  action: "company",
                  name,
                });
                setAdding(false);
                setQuery("");
                setOpen(company.id);
                setNotice(`Client “${company.name}” added. Add its website below.`);
                router.refresh();
              });
            }}
          >
            <div className="min-w-0 flex-1 basis-60 space-y-1.5">
              <Label htmlFor="new-company">Client (company) name</Label>
              <Input
                id="new-company"
                name="name"
                required
                maxLength={100}
                autoFocus
                className="bg-white"
              />
            </div>
            <Button type="submit" disabled={busy}>
              Create client
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
        )}

        {notice && (
          <p role="status" className="pb-3 text-sm text-neutral-600">
            {notice}
          </p>
        )}

        <div
          className={cn(
            "hidden gap-5 pb-1 text-[13px] text-neutral-500 lg:grid",
            grid,
          )}
        >
          <span>Client</span>
          <span>Websites</span>
          <span>Logins</span>
          <span>Status</span>
          <span>Updated</span>
          <span />
        </div>
        <div>
          {shown.map((row) => {
            const first = row.sites[0];
            const counts = row.sites.map((site) => siteStatus(data.sites[site.id]));
            const lives = counts.filter((c) => c === "live").length;
            const tests = counts.filter((c) => c === "test").length;
            return (
              <div key={row.company.id} className={rowLine}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Quick view ${row.company.name}`}
                  onClick={() => setOpen(row.company.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpen(row.company.id);
                    }
                  }}
                  className={cn(
                    // Hover tone grows outward (negative margin = padding): the content never moves.
                    "group -mx-4 grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-3.5 transition-colors hover:bg-[#f8f8f8]",
                    grid,
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        tintOf(row.company.id),
                      )}
                    >
                      {initialsOf(row.company.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-medium underline-offset-4 group-hover:underline">
                          {row.company.name}
                        </span>
                        {row.company.pinned && (
                          <Pin className="size-3.5 shrink-0 text-neutral-400" aria-label="Pinned" />
                        )}
                      </p>
                      {current?.companyId === row.company.id && (
                        <p className="text-[13px] text-neutral-500">Open now</p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    {first ? (
                      <>
                        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px]">
                          <span className="text-neutral-600">
                            {row.sites.length === 1 ? "1 site" : `${row.sites.length} sites`}
                          </span>
                          {lives > 0 && (
                            <span className={cn("rounded-full px-2 py-0.5 font-medium", toneClass.good)}>
                              {lives} Live
                            </span>
                          )}
                          {tests > 0 && (
                            <span className={cn("rounded-full px-2 py-0.5 font-medium", toneClass.progress)}>
                              {tests} Test
                            </span>
                          )}
                          {row.sites.length - lives - tests > 0 && (
                            <span className={cn("rounded-full px-2 py-0.5 font-medium", toneClass.progress)}>
                              {row.sites.length - lives - tests} Draft
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                          {first.name}
                          {data.sites[first.id]?.domain ? ` · ${data.sites[first.id]?.domain}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-neutral-400">No website yet</p>
                    )}
                  </div>
                  <p className="hidden text-[15px] text-neutral-600 lg:block">
                    {row.logins.length || "—"}
                  </p>
                  <div className="col-span-2 flex min-w-0 flex-wrap gap-1.5 lg:col-span-1">
                    <StudioStatus sites={row.sites} data={data} />
                  </div>
                  <p className="hidden text-[13px] text-neutral-500 lg:block">
                    {day(row.last)}
                  </p>
                  <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 lg:col-start-auto lg:row-start-auto">
                    <IconAction
                      label="Quick view"
                      onClick={() => setOpen(row.company.id)}
                    >
                      <Eye />
                    </IconAction>
                    <Button
                      variant="outline"
                      className={big}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (first) enter(first.id);
                        else setAddSiteFor(row.company.id);
                      }}
                    >
                      Manage <ArrowRight />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {!shown.length && (
            <p className="p-4 text-sm text-neutral-500">
              {query ? "No client matches your search." : "No clients yet."}
            </p>
          )}
        </div>
        {rows.length > pageSize && (
          <div className="flex items-center justify-end gap-2 pt-3 text-sm text-neutral-500">
            <span>
              {page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} of{" "}
              {rows.length}
            </span>
            <Button
              size="icon-lg"
              variant="outline"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-lg"
              variant="outline"
              aria-label="Next page"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </section>

      {openRow && (
        <ClientQuickView
          key={openRow.company.id}
          company={openRow.company}
          sites={openRow.sites}
          data={data}
          accounts={accounts}
          onAccount={saveAccount}
          currentId={current?.id}
          onClose={() => setOpen("")}
          onAddWebsite={() => setAddSiteFor(openRow.company.id)}
          onRenamed={() => router.refresh()}
        />
      )}
      {addSiteFor && (
        <AddWebsiteDialog
          companyId={addSiteFor}
          companyName={companies.find((company) => company.id === addSiteFor)?.name ?? ""}
          sites={sites.filter((site) => site.companyId === addSiteFor)}
          onClose={() => setAddSiteFor("")}
          onCreated={(site) => {
            setAddSiteFor("");
            setNotice(`Website “${site.name}” added at /site/${site.key}.`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  alert,
  href,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  alert?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="block text-sm text-neutral-500">{label}</span>
      <span className="mt-1.5 block text-[28px] leading-8 font-semibold tracking-[-0.02em]">
        {value}
      </span>
      <span
        className={cn(
          "mt-1 flex items-center gap-1.5 text-[13px]",
          alert ? "font-medium text-red-600" : "text-neutral-500",
        )}
      >
        {alert && <span className="size-1.5 rounded-full bg-red-600" />}
        {note}
      </span>
    </>
  );
  const style = cn(
    card,
    "block min-w-0 px-7 py-6 text-left",
  );
  return href ? (
    <Link href={href} className={style}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        document.getElementById("clients")?.scrollIntoView({ behavior: "smooth" });
      }}
      className={style}
    >
      {body}
    </button>
  );
}
