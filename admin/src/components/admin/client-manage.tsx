"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CircleCheck,
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  Plus,
  UserPlus,
} from "lucide-react";
import { AdminPanel, Segmented, rowLine, subPanel } from "./admin-panel";
import { SmallDialog } from "./small-dialog";
import { useWorkspace } from "./site-context";
import { switchSite } from "./site-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toneClass, toneDot } from "./status-tone";
import type { Company, Site } from "@/lib/builder/sites";
import type { StudioAccount, StudioData, StudioSite } from "@/lib/builder/studio";

// Client management for the owner: the quick-view drawer on the clients list and the
// Client page inside a client (/dashboard/client) share these parts (Vova, 2026-11-22).

export const big = "h-10 px-4 text-sm";
const field =
  "h-10 w-full rounded-lg border border-[#e2e2e2] bg-white px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
type Credentials = { email: string; password: string };
export type ClientTab = "websites" | "logins" | "billing";
export const clientTabs: [ClientTab, string][] = [
  ["websites", "Websites"],
  ["logins", "Logins"],
  ["billing", "Billing"],
];
const money = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Crypto-random login password (letters and digits only: safe to paste anywhere).
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

export async function send(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "Could not save.");
  return data;
}

// Logins that open this website: given the website itself or its whole company.
export const hasAccess = (account: StudioAccount, site: Site) =>
  account.role === "client" &&
  (account.scope.sites.includes(site.id) ||
    account.scope.companies.includes(site.companyId));

// Live = on its own connected domain; Test = published, only on our /site/... address;
// Draft = nothing published yet.
export function siteStatus(info?: StudioSite) {
  if (info?.live && info.domainLive) return "live" as const;
  if (info?.live) return "test" as const;
  return "draft" as const;
}
export function StatusBadge({ info }: { info?: StudioSite }) {
  const status = siteStatus(info);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClass[status === "live" ? "good" : "progress"],
      )}
      title={
        status === "live"
          ? "Live on its own domain"
          : status === "test"
            ? "Published on the test address, no domain yet"
            : "Nothing published yet"
      }
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          toneDot[status === "live" ? "good" : "progress"],
        )}
      />
      {status === "live" ? "Live" : status === "test" ? "Test" : "Draft"}
    </span>
  );
}
export const publicUrl = (site: Site, info?: StudioSite) =>
  info?.domain && info.domainLive ? `https://${info.domain}` : `/site/${site.key}`;

// Compact 40 px icon action with a tooltip (owner tools).
export function IconAction({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const style =
    "grid size-10 shrink-0 place-items-center rounded-lg text-neutral-600 transition-colors hover:bg-[#f5f5f5] hover:text-black [&_svg]:size-[18px]";
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className={style}
        onClick={(event: React.MouseEvent) => {
          event.stopPropagation();
          if (href) window.open(href, "_blank", "noopener");
          else onClick?.();
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Billing of a client's websites: open invoices, their total, overdue ones.
export function clientBilling(sites: Site[], data: StudioData) {
  const open = data.invoices.filter((invoice) =>
    sites.some((site) => site.id === invoice.siteId),
  );
  return {
    count: open.length,
    total: open.reduce((sum, invoice) => sum + invoice.amount, 0),
    overdue: open.filter((invoice) => invoice.overdue).length,
  };
}

// Studio status of a client or one website: billing (paid / unpaid / overdue) and open
// website orders and change requests. Not the client's own business activity.
export function StudioStatus({ sites, data }: { sites: Site[]; data: StudioData }) {
  const billing = clientBilling(sites, data);
  const orders = sites.reduce((n, site) => n + (data.sites[site.id]?.openOrders ?? 0), 0);
  const requests = sites.reduce((n, site) => n + (data.sites[site.id]?.openRequests ?? 0), 0);
  const count = (n: number, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : "";
  const pills = [
    billing.overdue
      ? { text: `${money(billing.total)} overdue`, tone: toneClass.critical }
      : billing.count
        ? { text: `${money(billing.total)} unpaid`, tone: toneClass.progress }
        : { text: "", tone: "" },
    { text: count(orders, "open order", "open orders"), tone: toneClass.progress },
    { text: count(requests, "change request", "change requests"), tone: toneClass.progress },
  ].filter((pill) => pill.text);
  return (
    <>
      {pills.map((pill) => (
        <span
          key={pill.text}
          className={cn("rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap", pill.tone)}
        >
          {pill.text}
        </span>
      ))}
    </>
  );
}

// Inline rename: pencil next to the name, Enter saves, Esc cancels.
export function ClientName({
  company,
  className,
  onRenamed,
}: {
  company: Company;
  className?: string;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {editing ? (
        <input
          aria-label="Client name"
          defaultValue={company.name}
          maxLength={100}
          autoFocus
          onBlur={() => setEditing(false)}
          onKeyDown={async (event) => {
            const name = event.currentTarget.value.trim();
            if (event.key === "Escape") setEditing(false);
            if (event.key !== "Enter" || !name) return;
            try {
              await send("/api/builder/sites", "POST", {
                action: "rename-company",
                id: company.id,
                name,
              });
              setEditing(false);
              setError("");
              onRenamed(name);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not rename.");
            }
          }}
          className="h-10 w-72 max-w-full rounded-lg border border-[#e2e2e2] bg-white px-3 text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <>
          <p className="truncate text-lg font-semibold">{company.name}</p>
          <IconAction label="Rename client" onClick={() => setEditing(true)}>
            <Pencil />
          </IconAction>
        </>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

// Add website dialog (Client page, drawer, and a client without websites).
export function AddWebsiteDialog({
  companyId,
  companyName,
  sites,
  onClose,
  onCreated,
}: {
  companyId: string;
  companyName: string;
  sites: Site[];
  onClose: () => void;
  onCreated: (site: Site) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <SmallDialog title={`Add website · ${companyName}`} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const value = Object.fromEntries(new FormData(event.currentTarget));
          setBusy(true);
          setError("");
          try {
            onCreated(
              await send("/api/builder/sites", "POST", {
                action: "site",
                companyId,
                name: value.name,
                ...(value.key ? { key: value.key } : {}),
                ...(value.copyFrom ? { copyFrom: value.copyFrom } : {}),
              }),
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="new-site-name">Website name</Label>
          <Input id="new-site-name" name="name" required maxLength={100} autoFocus className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-site-key">Address</Label>
          <Input
            id="new-site-key"
            name="key"
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="Generated from the name"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-site-copy">Start from</Label>
          <select id="new-site-copy" name="copyFrom" className={field}>
            <option value="">Blank website</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                Copy of {site.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <Button type="submit" className={big} disabled={busy}>
            Create website
          </Button>
          <Button type="button" className={big} variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </SmallDialog>
  );
}

function PasswordField({ id }: { id: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex min-w-0 gap-2">
      <Input
        id={id}
        name="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        minLength={12}
        maxLength={256}
        autoComplete="new-password"
        placeholder="At least 12 characters"
        className="h-10 min-w-0 font-mono"
      />
      <Button type="button" variant="outline" className={big} onClick={() => setValue(generatePassword())}>
        <KeyRound /> Generate
      </Button>
    </div>
  );
}

// Websites / Logins / Billing of one client, with their dialogs. Used by the drawer and
// the Client page.
export function ClientTabContent({
  tab,
  company,
  sites,
  data,
  accounts,
  onAccount,
  currentId,
}: {
  tab: ClientTab;
  company: Company;
  sites: Site[];
  data: StudioData;
  accounts: StudioAccount[];
  onAccount: (account: StudioAccount) => void;
  currentId?: string;
}) {
  const [dialog, setDialog] = useState<
    | { kind: "login"; site?: Site }
    | { kind: "reset"; account: StudioAccount }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const logins = accounts.filter((account) =>
    sites.some((site) => hasAccess(account, site)),
  );
  // Open invoices of this client: overdue first, then by due date.
  // All invoices of this client: unpaid first (overdue on top), then newest.
  const history = data.history
    .filter((invoice) => sites.some((site) => site.id === invoice.siteId))
    .sort(
      (a, b) =>
        Number(b.status === "open") - Number(a.status === "open") ||
        Number(b.overdue) - Number(a.overdue) ||
        b.issuedAt.localeCompare(a.issuedAt),
    );
  const siteName = (account: StudioAccount) =>
    account.scope.companies.includes(company.id)
      ? "All websites"
      : sites
          .filter((site) => account.scope.sites.includes(site.id))
          .map((site) => site.name)
          .join(", ");

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      {credentials && (
        <div className="mb-4 rounded-2xl bg-emerald-50 p-4" role="status">
          <p className="text-sm font-medium">
            Login details: shown once, send them to the client privately.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="break-all">{credentials.email}</span>
            <code className="rounded-md bg-white px-2 py-1 font-mono text-[13px] break-all">
              {credentials.password}
            </code>
            <IconAction
              label="Copy login details"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(`${location.origin}/login\n${credentials.email}\n${credentials.password}`)
                  .then(() => setNotice("Login details copied."))
              }
            >
              <Copy />
            </IconAction>
            <Button variant="ghost" className={big} onClick={() => setCredentials(null)}>
              Hide
            </Button>
          </div>
        </div>
      )}
      {(notice || (error && !dialog)) && (
        <p role="status" className={cn("mb-3 text-sm", error ? "text-red-600" : "text-neutral-600")}>
          {error || notice}
        </p>
      )}

      {tab === "websites" &&
        (sites.length ? (
          sites.map((site) => {
            const info = data.sites[site.id];
            return (
              <div key={site.id} className={cn(rowLine, "py-4")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{site.name}</span>
                      <StatusBadge info={info} />
                      {site.id === currentId && (
                        <span className="text-xs text-neutral-500">Open now</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                      {info?.domain ? `${info.domain}${info.domainLive ? "" : " (connecting)"} · ` : ""}
                      /site/{site.key}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <IconAction label="View public website" href={publicUrl(site, info)}>
                      <ExternalLink />
                    </IconAction>
                    <IconAction label="Add client login" onClick={() => setDialog({ kind: "login", site })}>
                      <UserPlus />
                    </IconAction>
                    <IconAction
                      label="Enter website"
                      onClick={() => switchSite(site.id, "/dashboard/website")}
                    >
                      <ArrowRight />
                    </IconAction>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StudioStatus sites={[site]} data={data} />
                </div>
              </div>
            );
          })
        ) : (
          <p className={cn(subPanel, "p-5 text-sm text-neutral-500")}>No websites yet.</p>
        ))}

      {tab === "logins" && (
        <>
          <div className="mb-2 flex justify-end">
            <Button
              variant="outline"
              className={big}
              disabled={!sites.length}
              onClick={() => setDialog({ kind: "login" })}
            >
              <UserPlus /> Add login
            </Button>
          </div>
          {logins.length ? (
            logins.map((account) => (
              <div key={account.id} className={cn(rowLine, "flex items-center gap-3 py-3")}>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="truncate font-medium">{account.name}</span>
                    {account.disabled && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        Disabled
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[13px] text-neutral-500">
                    {account.email} · {siteName(account)}
                  </p>
                </div>
                <IconAction label="Reset password" onClick={() => setDialog({ kind: "reset", account })}>
                  <KeyRound />
                </IconAction>
                <IconAction
                  label={account.disabled ? "Enable access" : "Disable access"}
                  onClick={() =>
                    run(async () => {
                      const saved = await send("/api/builder/accounts", "PATCH", {
                        id: account.id,
                        disabled: !account.disabled,
                      });
                      onAccount(saved);
                      setNotice(
                        saved.disabled
                          ? `${saved.name}: access disabled, sessions signed out.`
                          : `${saved.name}: access enabled.`,
                      );
                    })
                  }
                >
                  {account.disabled ? <CircleCheck /> : <Ban />}
                </IconAction>
              </div>
            ))
          ) : (
            <p className={cn(subPanel, "p-5 text-sm text-neutral-500")}>No client logins yet.</p>
          )}
        </>
      )}

      {tab === "billing" && (
        <>
          {sites
            .filter((item) => data.sites[item.id]?.plan)
            .map((item) => {
              const info = data.sites[item.id];
              return (
                <div key={item.id} className={cn(rowLine, "py-3")}>
                  <p className="text-sm font-medium">
                    {info.plan!.kind === "yearly" ? "Yearly" : "Monthly"} hosting ·{" "}
                    {money(info.plan!.price)}
                    {sites.length > 1 ? ` · ${item.name}` : ""}
                  </p>
                  <p
                    className={cn(
                      "text-[13px]",
                      info.subscription === "overdue" || info.subscription === "suspended"
                        ? "font-medium text-red-600"
                        : "text-neutral-500",
                    )}
                  >
                    {info.subscription === "overdue" || info.subscription === "suspended"
                      ? `Hosting ${info.subscription}`
                      : info.paidUntil
                        ? `Paid until ${day(info.paidUntil)} · renews then`
                        : "No payment yet"}
                  </p>
                </div>
              );
            })}
          <div className="flex items-center justify-between pt-4 pb-1">
            <p className="text-sm text-neutral-500">Invoices</p>
            <Link href="/dashboard/billing" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black">
              All invoices <ArrowRight className="size-4" />
            </Link>
          </div>
          {history.length ? (
            history.slice(0, 5).map((invoice) => (
              <div key={invoice.id} className={cn(rowLine, "flex items-center gap-3 py-3")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invoice.number}</p>
                  <p className="truncate text-[13px] text-neutral-500">
                    {day(invoice.issuedAt)} · {invoice.description}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{money(invoice.amount)}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    toneClass[
                      invoice.status === "paid"
                        ? "good"
                        : invoice.status === "void"
                          ? "inactive"
                          : invoice.overdue
                            ? "critical"
                            : "progress"
                    ],
                  )}
                >
                  {invoice.status === "paid"
                    ? "Paid"
                    : invoice.status === "void"
                      ? "Void"
                      : invoice.overdue
                        ? "Overdue"
                        : "Pending"}
                </span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm text-neutral-500">No invoices yet.</p>
          )}
        </>
      )}

      {dialog?.kind === "login" && (
        <SmallDialog
          title={`Client login${dialog.site ? ` · ${dialog.site.name}` : ""}`}
          onClose={() => setDialog(null)}
        >
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Object.fromEntries(new FormData(event.currentTarget));
              const siteId = dialog.site?.id ?? String(value.site);
              run(async () => {
                const account = await send("/api/builder/accounts", "POST", {
                  name: value.name,
                  email: value.email,
                  password: value.password,
                  role: "client",
                  scope: { companies: [], sites: [siteId] },
                });
                onAccount(account);
                setCredentials({ email: account.email, password: String(value.password) });
                setDialog(null);
              });
            }}
          >
            {!dialog.site && (
              <div className="space-y-1.5">
                <Label htmlFor="login-site">Website</Label>
                <select id="login-site" name="site" className={field}>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="login-name">Name</Label>
              <Input id="login-name" name="name" required maxLength={100} autoComplete="off" autoFocus className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" name="email" type="email" required autoComplete="off" className="h-10" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <PasswordField id="login-password" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-2 flex gap-2">
              <Button type="submit" className={big} disabled={busy}>
                Create login
              </Button>
              <Button type="button" className={big} variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </SmallDialog>
      )}
      {dialog?.kind === "reset" && (
        <SmallDialog title={`Reset password · ${dialog.account.name}`} onClose={() => setDialog(null)}>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const password = String(new FormData(event.currentTarget).get("password"));
              const target = dialog.account;
              run(async () => {
                const saved = await send("/api/builder/accounts", "PATCH", {
                  id: target.id,
                  password,
                });
                onAccount(saved);
                setCredentials({ email: saved.email, password });
                setDialog(null);
              });
            }}
          >
            <PasswordField id="reset-password" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-2 flex gap-2">
              <Button type="submit" className={big} disabled={busy}>
                Save password
              </Button>
              <Button type="button" className={big} variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </SmallDialog>
      )}
    </div>
  );
}

// Client page inside a client (/dashboard/client).
export function ClientManage({ data }: { data: StudioData }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const site = workspace?.site;
  const company = workspace?.companies.find((item) => item.id === site?.companyId);
  const sites = (workspace?.sites ?? []).filter((item) => item.companyId === site?.companyId);
  const [accounts, setAccounts] = useState(data.accounts);
  const [tab, setTab] = useState<ClientTab>("websites");
  const [adding, setAdding] = useState(false);
  if (!site || !company) return null;
  const saveAccount = (account: StudioAccount) =>
    setAccounts((list) =>
      list.some((item) => item.id === account.id)
        ? list.map((item) => (item.id === account.id ? account : item))
        : [...list, account],
    );
  return (
    <AdminPanel
      title={`Client ${company.name}`}
      toolbar={
        <>
          <ClientName company={company} className="mr-auto" onRenamed={() => router.refresh()} />
          <Segmented items={clientTabs} active={tab} onSelect={(id) => setTab(id as ClientTab)} />
          <Button className={big} onClick={() => setAdding(true)}>
            <Plus /> Add website
          </Button>
        </>
      }
    >
      <ClientTabContent
        tab={tab}
        company={company}
        sites={sites}
        data={data}
        accounts={accounts}
        onAccount={saveAccount}
        currentId={site.id}
      />
      {adding && (
        <AddWebsiteDialog
          companyId={company.id}
          companyName={company.name}
          sites={sites}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </AdminPanel>
  );
}
