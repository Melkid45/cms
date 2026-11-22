"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdminPanel, Segmented, chip } from "../admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toneClass } from "../status-tone";

// Shapes returned by GET /api/builder/billing (see lib/builder/billing.ts).
interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
}
interface Settings {
  currency: "EUR";
  setupFee: number;
  designerFee: number;
  designerHours: number;
  standardHours: number;
  monthly: number;
  yearly: number;
  graceDays: number;
  reminderDays: number[];
  addons: Addon[];
}
interface Subscription {
  siteId: string;
  companyId: string;
  plan: "monthly" | "yearly";
  paidUntil: string;
  status: "active" | "overdue" | "suspended";
}
interface Invoice {
  id: string;
  number: string;
  companyId: string;
  siteId: string;
  kind: "setup" | "subscription" | "addon" | "change";
  description: string;
  amount: number;
  currency: "EUR";
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  status: "open" | "paid" | "void";
}
interface Overview {
  settings: Settings;
  subscriptions: Subscription[];
  invoices: Invoice[];
  siteAddons?: { siteId: string; addonId: string }[];
  companies: { id: string; name: string }[];
  sites: { id: string; companyId: string; key: string; name: string }[];
  orders: { id: string; companyId?: string; siteId?: string }[];
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    value,
  );
const date = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const overdue = (invoice: Invoice) =>
  invoice.status === "open" && invoice.dueAt < new Date().toISOString();

async function call(method: string, body: unknown) {
  const response = await fetch("/api/builder/billing", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Could not save.");
  return data;
}

async function fetchOverview(): Promise<Overview> {
  const response = await fetch("/api/builder/billing", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Could not load billing.");
  return body;
}

// One container, sections as toolbar tabs (same pattern as every admin screen).
const tabs = [
  ["invoices", "Invoices"],
  ["clients", "Clients"],
  ["modules", "Modules"],
  ["prices", "Prices and rules"],
] as const;
export function BillingDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetchOverview().then(
        (body) => {
          setData(body);
          setError("");
        },
        (e) =>
          setError(e instanceof Error ? e.message : "Could not load billing."),
      ),
    [],
  );
  useEffect(() => {
    let active = true;
    fetchOverview().then(
      (body) => {
        if (active) setData(body);
      },
      (e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load billing.");
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("invoices");
  const [invoiceFilter, setInvoiceFilter] = useState<Filter>("open");
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await action();
      await load();
      setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminPanel
      title="Billing"
      toolbar={
        <>
          <Segmented
            items={tabs}
            active={tab}
            onSelect={(id) => setTab(id as (typeof tabs)[number][0])}
          />
          {tab === "invoices" && data && (
            <div className="flex flex-wrap gap-2.5 lg:ml-auto">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setInvoiceFilter(item.value)}
                  className={chip(invoiceFilter === item.value)}
                >
                  {item.label}
                  <span className="ml-1.5 opacity-60">
                    {data.invoices.filter((invoice) => matchesFilter(invoice, item.value)).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm">
          {notice}
        </p>
      )}
      {!data ? (
        !error && <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {tab === "clients" && <Clients data={data} />}
          {tab === "invoices" && (
          <Invoices
            data={data}
            filter={invoiceFilter}
            busy={busy}
            onAction={(id, action) =>
              run(
                () => call("PATCH", { id, action }),
                action === "paid"
                  ? "Invoice marked as paid."
                  : action === "void"
                    ? "Invoice voided."
                    : "Invoice reopened.",
              )
            }
          />
          )}
          {tab === "invoices" && (
            <p className="mt-5 text-sm text-neutral-500">
              Card payments are not connected yet: when a client pays, mark the
              invoice as paid here.
            </p>
          )}
          {tab === "modules" && (
          <EnableModule
            data={data}
            busy={busy}
            onEnable={(siteId, addonId, companyId) =>
              run(
                () => call("POST", { siteId, addonId, companyId }),
                "Module enabled and invoiced.",
              )
            }
          />
          )}
          {tab === "prices" && (
          <SettingsForm
            key={JSON.stringify(data.settings)}
            settings={data.settings}
            busy={busy}
            onSave={(settings) =>
              run(() => call("PUT", settings), "Billing settings saved.")
            }
          />
          )}
        </>
      )}
    </AdminPanel>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="sr-only">{title}</h2>
      {action && <div className="mb-4 flex flex-wrap justify-end gap-3">{action}</div>}
      {children}
    </section>
  );
}

// Shared status colours (status-tone.ts).
const statusStyle: Record<string, string> = {
  active: toneClass.good,
  paid: toneClass.good,
  open: toneClass.progress,
  void: toneClass.inactive,
  overdue: toneClass.critical,
  suspended: toneClass.critical,
};
function Status({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        statusStyle[value] || statusStyle.open,
      )}
    >
      {value}
    </span>
  );
}

const th = "px-3 py-2 text-left text-xs font-medium text-neutral-500";
const td = "px-3 py-3 align-top";

function Clients({ data }: { data: Overview }) {
  const rows = data.companies.map((company) => ({
    company,
    sites: data.sites
      .filter((site) => site.companyId === company.id)
      .map((site) => {
        const sub = data.subscriptions.find((s) => s.siteId === site.id);
        const open = data.invoices
          .filter((i) => i.siteId === site.id && i.status === "open")
          .reduce((sum, i) => sum + i.amount, 0);
        const orders = data.orders.filter((o) => o.siteId === site.id).length;
        return { site, sub, open, orders };
      }),
  }));
  return (
    <Section
      title="Clients"
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className={th}>Client / website</th>
              <th className={th}>Plan</th>
              <th className={th}>Status</th>
              <th className={th}>Paid until</th>
              <th className={cn(th, "text-right")}>Open amount</th>
              <th className={cn(th, "text-right")}>Orders</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ company, sites }) => [
              <tr key={`company-${company.id}`}>
                <td colSpan={6} className="px-3 pb-1 pt-4 font-semibold">
                  {company.name}
                </td>
              </tr>,
              ...sites.map(({ site, sub, open, orders }) => (
                <tr
                  key={`site-${site.id}`}
                  className={cn(
                    sub?.status === "overdue" && "bg-amber-50",
                    sub?.status === "suspended" && "bg-red-50",
                  )}
                >
                  <td className={cn(td, "pl-6")}>
                    {site.name}
                    <span className="block text-xs text-neutral-400">
                      /site/{site.key}
                    </span>
                  </td>
                  <td className={cn(td, "capitalize")}>
                    {sub ? sub.plan : "—"}
                  </td>
                  <td className={td}>
                    {sub ? (
                      <Status value={sub.status} />
                    ) : (
                      <span className="text-xs text-neutral-400">
                        No subscription
                      </span>
                    )}
                  </td>
                  <td className={td}>{sub ? date(sub.paidUntil) : "—"}</td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    {open ? money(open) : "—"}
                  </td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    {orders || "—"}
                  </td>
                </tr>
              )),
              ...(sites.length
                ? []
                : [
                    <tr key={`${company.id}-empty`}>
                      <td
                        colSpan={6}
                        className={cn(td, "pl-6 text-neutral-400")}
                      >
                        No websites yet.
                      </td>
                    </tr>,
                  ]),
            ])}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

type Filter = "open" | "overdue" | "paid" | "all";
const matchesFilter = (invoice: Invoice, value: Filter) =>
  value === "all"
    ? true
    : value === "overdue"
      ? overdue(invoice)
      : invoice.status === value;
const filters: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
];
const kinds: Record<Invoice["kind"], string> = {
  setup: "Setup",
  subscription: "Hosting",
  addon: "Module",
  change: "Change",
};

function Invoices({
  data,
  filter,
  busy,
  onAction,
}: {
  data: Overview;
  filter: Filter;
  busy: boolean;
  onAction: (id: string, action: "paid" | "void" | "open") => void;
}) {
  const company = (id: string) =>
    data.companies.find((c) => c.id === id)?.name || "—";
  const site = (id: string) => data.sites.find((s) => s.id === id)?.name || "—";
  const list = data.invoices.filter((invoice) => matchesFilter(invoice, filter));
  return (
    <Section title="Invoices">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className={th}>Number</th>
              <th className={th}>Client</th>
              <th className={th}>Website</th>
              <th className={th}>Kind</th>
              <th className={th}>Description</th>
              <th className={cn(th, "text-right")}>Amount</th>
              <th className={th}>Issued</th>
              <th className={th}>Due</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((invoice) => {
              const late = overdue(invoice);
              return (
                <tr
                  key={invoice.id}
                  className={cn(
                    "even:bg-neutral-50/60",
                    late && "bg-amber-50 even:bg-amber-50",
                  )}
                >
                  <td className={cn(td, "whitespace-nowrap font-medium")}>
                    {invoice.number}
                  </td>
                  <td className={cn(td, "min-w-32")}>
                    {company(invoice.companyId)}
                  </td>
                  <td className={cn(td, "min-w-32")}>{site(invoice.siteId)}</td>
                  <td className={td}>{kinds[invoice.kind]}</td>
                  <td className={cn(td, "min-w-56 max-w-72 text-neutral-600")}>
                    {invoice.description}
                  </td>
                  <td
                    className={cn(
                      td,
                      "whitespace-nowrap text-right tabular-nums",
                    )}
                  >
                    {money(invoice.amount)}
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {date(invoice.issuedAt)}
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {date(invoice.dueAt)}
                  </td>
                  <td className={td}>
                    <Status value={late ? "overdue" : invoice.status} />
                    {invoice.paidAt && (
                      <span className="mt-1 block text-[11px] text-neutral-400">
                        {date(invoice.paidAt)}
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-right")}>
                    {invoice.status === "open" ? (
                      <span className="inline-flex gap-1">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => onAction(invoice.id, "paid")}
                        >
                          Mark paid
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onAction(invoice.id, "void")}
                        >
                          Void
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onAction(invoice.id, "open")}
                      >
                        Reopen
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && (
          <p className="p-6 text-center text-sm text-neutral-500">
            No invoices here.
          </p>
        )}
      </div>
    </Section>
  );
}

function EnableModule({
  data,
  busy,
  onEnable,
}: {
  data: Overview;
  busy: boolean;
  onEnable: (siteId: string, addonId: string, companyId: string) => void;
}) {
  const [siteId, setSiteId] = useState("");
  const [addonId, setAddonId] = useState("");
  const addons = data.settings.addons;
  const enabled = useMemo(
    () =>
      (data.siteAddons || []).map((item) => ({
        ...item,
        site: data.sites.find((s) => s.id === item.siteId)?.name || item.siteId,
        addon: addons.find((a) => a.id === item.addonId)?.name || item.addonId,
      })),
    [data.siteAddons, data.sites, addons],
  );
  const site = data.sites.find((s) => s.id === siteId);
  return (
    <Section
      title="Enable a module"
    >
      {!addons.length ? (
        <p className="text-sm text-neutral-500">
          No modules yet. Add them in the settings below.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="module-site">Website</Label>
            <Select
              id="module-site"
              value={siteId}
              onValueChange={setSiteId}
              placeholder="Choose a website"
            >
              {data.sites.map((s) => (
                <SelectOption key={s.id} value={s.id}>
                  {s.name}
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="module-addon">Module</Label>
            <Select
              id="module-addon"
              value={addonId}
              onValueChange={setAddonId}
              placeholder="Choose a module"
            >
              {addons.map((a) => (
                <SelectOption key={a.id} value={a.id}>
                  {`${a.name} · ${money(a.price)}`}
                </SelectOption>
              ))}
            </Select>
          </div>
          <Button
            disabled={busy || !site || !addonId}
            onClick={() => site && onEnable(site.id, addonId, site.companyId)}
          >
            Enable module
          </Button>
        </div>
      )}
      {enabled.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-neutral-600">
          {enabled.map((item) => (
            <li key={`${item.siteId}-${item.addonId}`}>
              {item.addon} · {item.site}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (settings: Omit<Settings, "currency">) => void;
}) {
  const [addons, setAddons] = useState<Addon[]>(settings.addons);
  const [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const num = (name: string) => Number(form.get(name));
    const reminderDays = String(form.get("reminderDays") || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number);
    if (reminderDays.some((d) => !Number.isInteger(d) || d < 0)) {
      setError("Reminder days must be whole numbers, separated by commas.");
      return;
    }
    if (addons.some((a) => !/^[a-z0-9-]{1,40}$/.test(a.id))) {
      setError(
        "Module ids use lowercase letters, numbers and dashes (for example booking-form).",
      );
      return;
    }
    if (new Set(addons.map((a) => a.id)).size !== addons.length) {
      setError("Module ids must be unique.");
      return;
    }
    setError("");
    onSave({
      setupFee: num("setupFee"),
      designerFee: num("designerFee"),
      designerHours: num("designerHours"),
      standardHours: num("standardHours"),
      monthly: num("monthly"),
      yearly: num("yearly"),
      graceDays: num("graceDays"),
      reminderDays,
      addons: addons.map((a) => ({ ...a, price: Number(a.price) || 0 })),
    });
  }
  const field = (
    name: keyof Settings,
    label: string,
    hint: string,
    step = "0.01",
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`billing-${name}`}>{label}</Label>
      <Input
        id={`billing-${name}`}
        name={name}
        type="number"
        min={0}
        step={step}
        required
        defaultValue={String(settings[name])}
      />
      <p className="text-xs text-neutral-400">{hint}</p>
    </div>
  );
  const update = (index: number, patch: Partial<Addon>) =>
    setAddons(addons.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  return (
    <Section
      title="Prices and rules"
    >
      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {field("setupFee", "Setup fee, €", "Standard website creation")}
          {field("standardHours", "Standard hours", "Delivery time", "1")}
          {field("designerFee", "Designer pack, €", "Hand-made design")}
          {field("designerHours", "Designer pack hours", "Delivery time", "1")}
          {field("monthly", "Monthly, €", "Hosting and maintenance")}
          {field("yearly", "Yearly, €", "Hosting and maintenance")}
          {field(
            "graceDays",
            "Grace days",
            "Website is switched off after this many days overdue",
            "1",
          )}
          <div className="grid gap-2">
            <Label htmlFor="billing-reminderDays">Reminder days</Label>
            <Input
              id="billing-reminderDays"
              name="reminderDays"
              defaultValue={settings.reminderDays.join(", ")}
              placeholder="3, 14, 30"
            />
            <p className="text-xs text-neutral-400">
              Days after the due date, separated by commas
            </p>
          </div>
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Modules (add-ons)</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setAddons([
                  ...addons,
                  { id: "", name: "", description: "", price: 0 },
                ])
              }
            >
              <Plus /> Add module
            </Button>
          </div>
          {!addons.length && (
            <p className="text-sm text-neutral-500">No modules yet.</p>
          )}
          <div className="space-y-3">
            {addons.map((addon, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-[10rem_1fr_2fr_7rem_auto] sm:items-end"
              >
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`addon-id-${index}`}>
                    Id
                  </Label>
                  <Input
                    id={`addon-id-${index}`}
                    value={addon.id}
                    required
                    placeholder="booking-form"
                    onChange={(e) => update(index, { id: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`addon-name-${index}`}>
                    Name
                  </Label>
                  <Input
                    id={`addon-name-${index}`}
                    value={addon.name}
                    required
                    maxLength={100}
                    onChange={(e) => update(index, { name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`addon-text-${index}`}>
                    Description
                  </Label>
                  <Input
                    id={`addon-text-${index}`}
                    value={addon.description}
                    maxLength={500}
                    onChange={(e) =>
                      update(index, { description: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs" htmlFor={`addon-price-${index}`}>
                    Price, €
                  </Label>
                  <Input
                    id={`addon-price-${index}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={String(addon.price)}
                    onChange={(e) =>
                      update(index, { price: Number(e.target.value) })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove module ${addon.name || index + 1}`}
                  onClick={() =>
                    setAddons(addons.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          Save settings
        </Button>
      </form>
    </Section>
  );
}
