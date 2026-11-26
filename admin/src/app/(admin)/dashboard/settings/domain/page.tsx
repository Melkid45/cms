"use client";
import { toneClass } from "@/components/admin/status-tone";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { registrable, type DnsRecord, type DomainStatus, type DomainView, type ImportRecord } from "@/lib/builder/domains/names";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Settings → Domain: the client connects a domain they bought, without our help.
// API: /api/builder/domains (lib/builder/domains). BUILDER.md → Custom domains.
type Data = {
  site: { id: string; key: string; name: string };
  domains: DomainView[];
  provider: "local" | "vercel";
  live: boolean;
  max: number;
};
const STATUS: Record<DomainStatus, { label: string; text: string; tone: string; icon: typeof Clock3 }> = {
  pending: {
    label: "Waiting for DNS records",
    text: "Add the records below at your domain registrar. We check automatically every minute.",
    tone: toneClass.progress,
    icon: Clock3,
  },
  verifying: {
    label: "Almost there",
    text: "Some records are in place. DNS changes can take from a few minutes up to a few hours to spread.",
    tone: toneClass.progress,
    icon: Loader2,
  },
  active: {
    label: "Connected",
    text: "The domain works and has an HTTPS certificate.",
    tone: toneClass.good,
    icon: CheckCircle2,
  },
  error: {
    label: "Needs attention",
    text: "Something in the DNS settings does not match. See what to fix below.",
    tone: toneClass.critical,
    icon: AlertTriangle,
  },
};
const ago = (iso?: string) => {
  if (!iso) return "not checked yet";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "checked just now";
  if (s < 3600) return `checked ${Math.round(s / 60)} min ago`;
  return `checked ${new Date(iso).toLocaleString()}`;
};

async function call(body?: object) {
  const response = await fetch(withSite("/api/builder/domains"), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

function RecordState({ record }: { record: DnsRecord }) {
  if (record.ok === undefined) return null;
  if (record.ok)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <Check className="size-3.5" /> Found
      </span>
    );
  return (
    <span className="text-xs text-neutral-500">
      {record.found?.length ? `Now: ${record.found.join(", ")}` : "Not found yet"}
    </span>
  );
}

const PURPOSE: Record<DnsRecord["purpose"], string> = {
  routing: "Points the domain to your website",
  www: "Makes www.your-domain open the website too",
  ownership: "Proves the domain is yours",
};
function Records({ domain }: { domain: DomainView }) {
  const apex = domain.records.find((r) => r.purpose === "routing" && r.type === "A");
  const cname = domain.records.find((r) => r.type === "CNAME")?.value;
  return (
    <div className="space-y-3">
      {domain.records.map((record) => (
        <div key={`${record.type}-${record.host}`} className="rounded-lg bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{PURPOSE[record.purpose]}</p>
            <RecordState record={record} />
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[90px_1fr_2fr]">
            <div>
              <dt className="text-xs text-neutral-500">Type</dt>
              <dd className="mt-1 font-mono">{record.type}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-neutral-500">Name / Host</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="min-w-0 truncate font-mono">{record.name}</span>
                <CopyButton value={record.name} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-neutral-500">Value / Points to</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="min-w-0 break-all font-mono">{record.value}</span>
                <CopyButton value={record.value} />
              </dd>
            </div>
          </dl>
        </div>
      ))}
      {apex && cname && (
        <p className="text-xs leading-5 text-neutral-500">
          Your DNS provider does not allow an A record on “@”? Use an <b>ALIAS</b>,{" "}
          <b>ANAME</b> or flattened <b>CNAME</b> record for “@” pointing to{" "}
          <span className="font-mono">{cname}</span> instead. Delete other A and AAAA records
          of “@” (e.g. the registrar’s parking page). TTL: automatic or 300–3600.
        </p>
      )}
    </div>
  );
}

// Manual records (advanced): where to add them.
const GUIDES: { name: string; steps: string[] }[] = [
  {
    name: "Cloudflare",
    steps: [
      "Open dash.cloudflare.com → your domain → DNS → Records → Add record.",
      "Create each record from the list. For “@” type @, for www type www.",
      "Set Proxy status to “DNS only” (grey cloud) for the A and CNAME records until the status here is “Connected”: the hosting must see the domain directly to issue the HTTPS certificate.",
      "After that you may switch the proxy on (orange cloud), but then set SSL/TLS → Overview → “Full (strict)”. “Flexible” causes an endless redirect loop.",
    ],
  },
  {
    name: "Namecheap",
    steps: [
      "Domain List → Manage → Advanced DNS → Add new record.",
      "A Record: Host @, Value from the list. CNAME Record: Host www. TXT Record: Host as shown.",
      "Remove the default “URL Redirect Record” and “parkingpage” CNAME if they exist.",
    ],
  },
  {
    name: "GoDaddy",
    steps: [
      "My Products → your domain → DNS → Manage DNS → Add New Record.",
      "Edit the existing A record “@” (“Parked”) to the value from the list instead of adding a second one.",
      "Replace the existing CNAME “www” with the value from the list.",
    ],
  },
  {
    name: "Other registrars",
    steps: [
      "Find “DNS”, “DNS zone” or “Name server records” in the domain settings.",
      "Some panels want the full name (www.zcena.com) instead of “www”, or an empty field instead of “@”.",
    ],
  },
];

// Main mode: replace the nameservers at the registrar (one action).
const NS_GUIDES: { name: string; steps: string[] }[] = [
  {
    name: "Namecheap",
    steps: [
      "Domain List → Manage next to the domain.",
      "Nameservers → choose “Custom DNS”.",
      "Enter the two nameservers above (delete any others) and press the green tick.",
    ],
  },
  {
    name: "GoDaddy",
    steps: [
      "My Products → your domain → DNS → Nameservers → Change Nameservers.",
      "Choose “I'll use my own nameservers”, enter the two above, Save.",
    ],
  },
  {
    name: "Cloudflare Registrar",
    steps: [
      "Domains registered at Cloudflare must keep Cloudflare's nameservers, they cannot be changed.",
      "Use “Advanced options → Cloudflare in one click” below instead: we add the records to your Cloudflare for you.",
    ],
  },
  {
    name: "nic.lv and Latvian resellers",
    steps: [
      "Open the domain in your reseller's panel and find “Nameservers” / “DNS serveri”.",
      "Replace them with the two above and save.",
      "No such setting in the panel? Write to the reseller's support: “Please change the DNS servers of <domain> to” and the two nameservers. NIC.LV checks the new servers; they are already prepared for your domain.",
    ],
  },
  {
    name: "Hostinger",
    steps: [
      "hPanel → Domains → your domain → DNS / Nameservers → Change nameservers.",
      "Choose “Change nameservers”, enter the two above, Save.",
    ],
  },
  {
    name: "Zone",
    steps: [
      "My Zone → Domains → your domain → Nameservers.",
      "Switch to your own nameservers, enter the two above, Save.",
    ],
  },
  {
    name: "OVH",
    steps: [
      "Web Cloud → Domain names → your domain → tab “DNS servers”.",
      "Modify DNS servers → replace all of them with the two above → Apply configuration.",
    ],
  },
  {
    name: "Other registrars",
    steps: [
      "In the domain settings find “Nameservers” or “DNS servers”.",
      "Choose custom nameservers, delete the old ones, enter the two above, save.",
      "The switch takes from a few minutes up to 24 hours. This page checks by itself.",
    ],
  },
];

function Guides({ guides }: { guides: { name: string; steps: string[] }[] }) {
  return (
    <div className="space-y-2">
      {guides.map((guide) => (
        <details key={guide.name} className="rounded-lg bg-neutral-50 px-4 py-3">
          <summary className="cursor-pointer text-sm">{guide.name}</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-neutral-600">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

function CopyRow({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-4 py-3">
      <span className="min-w-0 break-all font-mono text-[15px]">{value}</span>
      <CopyButton value={value} />
    </div>
  );
}

const IMPORT_STATE: Record<ImportRecord["state"], string> = {
  pending: "",
  copied: "Copied",
  preview: "Test mode: would be copied",
  failed: "Not copied",
};
function Imports({
  domain,
  live,
  working,
  onAction,
}: {
  domain: DomainView;
  live: boolean;
  working: boolean;
  onAction: (action: string, extra?: object) => Promise<unknown>;
}) {
  const imports = domain.imports ?? [];
  const saved = imports.filter((i) => i.selected).map((i) => i.id);
  const [selected, setSelected] = useState<string[] | null>(null);
  const current = selected ?? saved;
  const changed = selected !== null && (selected.length !== saved.length || selected.some((id) => !saved.includes(id)));
  if (!imports.length)
    return (
      <p className="text-sm text-neutral-600">
        We found no email records on this domain, so nothing needs to be moved.{" "}
        <button type="button" className="underline underline-offset-4" disabled={working} onClick={() => void onAction("scan")}>
          Look again
        </button>
      </p>
    );
  const count = current.length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        {count
          ? `We will move ${count} record${count === 1 ? "" : "s"} of your email and services to the new DNS, so email keeps working after the switch.`
          : "Nothing selected: these records will not exist after the switch."}
        {!live && " Test mode: nothing is created at the hosting yet."}
      </p>
      <ul className="space-y-2">
        {imports.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-neutral-50 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-black"
                checked={current.includes(item.id)}
                onChange={(e) =>
                  setSelected(e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{item.label}</span>
                  {IMPORT_STATE[item.state] && (
                    <span className={`text-xs ${item.state === "failed" ? "text-red-700" : item.state === "copied" ? "text-emerald-700" : "text-neutral-500"}`}>
                      {IMPORT_STATE[item.state]}
                    </span>
                  )}
                </span>
                <span className="mt-1 block break-all font-mono text-xs text-neutral-500">
                  {item.type} {item.name || "@"} {item.priority !== undefined ? `${item.priority} ` : ""}
                  {item.value.length > 90 ? item.value.slice(0, 90) + "…" : item.value}
                </span>
                {item.error && <span className="mt-1 block text-xs text-red-700">{item.error}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        {changed && (
          <Button
            type="button"
            size="sm"
            disabled={working}
            onClick={async () => {
              if (await onAction("imports", { selected: current })) setSelected(null);
            }}
          >
            Save selection
          </Button>
        )}
        <button type="button" className="text-xs text-neutral-500 underline underline-offset-4" disabled={working} onClick={() => void onAction("scan")}>
          Read the records again
        </button>
      </div>
    </div>
  );
}

function CloudflareForm({
  domain,
  working,
  onAction,
}: {
  domain: DomainView;
  working: boolean;
  onAction: (action: string, extra?: object) => Promise<unknown>;
}) {
  const [token, setToken] = useState("");
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onAction("cloudflare", { token })) setToken("");
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-neutral-600">
        <li>Cloudflare → My Profile → API Tokens → Create Token → template “Edit zone DNS”.</li>
        <li>Zone Resources: Include → Specific zone → {registrable(domain.domain)}. Create and copy the token.</li>
        <li>Paste it here. We create the records with “DNS only” and store the token encrypted.</li>
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          autoComplete="off"
          placeholder="Cloudflare API token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-label="Cloudflare API token"
        />
        <Button type="submit" disabled={!token.trim() || working} className="shrink-0">
          Create records
        </Button>
      </div>
      {domain.cloudflare && <p className="text-xs text-neutral-500">A Cloudflare token is saved for this domain.</p>}
    </form>
  );
}

function DomainCard({
  domain,
  count,
  busy,
  live,
  onAction,
}: {
  domain: DomainView;
  count: number;
  busy: string;
  live: boolean;
  onAction: (action: string, extra?: object) => Promise<unknown>;
}) {
  const status = STATUS[domain.status];
  const Icon = status.icon;
  const active = domain.status === "active";
  const working = busy.startsWith(domain.domain);
  const nameservers = domain.nameservers ?? [];
  const nsMode = nameservers.length > 0;
  const manual = (
    <div className="space-y-4">
      <Records domain={domain} />
      <Guides guides={GUIDES} />
    </div>
  );
  return (
    <section className="rounded-xl border bg-white">
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-all text-xl font-semibold tracking-[-0.02em]">{domain.domain}</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {ago(domain.checkedAt)}
              {domain.primary ? " · primary domain" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={working} onClick={() => onAction("check")}>
              <RefreshCw className={`size-4 ${busy === `${domain.domain}:check` ? "animate-spin" : ""}`} />
              Check now
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={working}
              onClick={() => {
                if (confirm(`Disconnect ${domain.domain}? The website stops opening on this domain.`))
                  void onAction("remove");
              }}
            >
              <Trash2 className="size-4" />
              Disconnect
            </Button>
          </div>
        </div>

        <div className={`flex gap-3 rounded-lg p-4 ${status.tone}`} role="status">
          <Icon className={`mt-0.5 size-6 shrink-0 ${domain.status === "verifying" ? "animate-spin [animation-duration:3s]" : ""}`} />
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              {nsMode && domain.status === "pending" ? "Waiting for the nameserver change" : status.label}
            </p>
            {active ? (
              <p className="mt-1 text-sm">
                Your website opens at{" "}
                <a
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                  href={`https://${domain.domain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  https://{domain.domain} <ExternalLink className="size-3.5" />
                </a>
              </p>
            ) : (
              <p className="mt-1 text-sm">
                {nsMode && domain.status === "pending"
                  ? "Do the one step below at your registrar. We check automatically every minute."
                  : status.text}
              </p>
            )}
            {domain.error && <p className="mt-2 text-sm font-medium">{domain.error}</p>}
            {domain.warnings?.map((w) => (
              <p key={w} className="mt-2 text-sm">{w}</p>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg bg-neutral-50 p-4">
          <div>
            <p className="text-sm font-medium">Primary domain</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Search engines and shared links use it. Other domains redirect to it.
            </p>
          </div>
          <Switch
            checked={domain.primary}
            disabled={domain.primary || working || count < 2}
            onCheckedChange={(on) => on && void onAction("primary")}
            aria-label={`Make ${domain.domain} the primary domain`}
          />
        </div>

        {nsMode ? (
          <details open={!active}>
            <summary className="cursor-pointer text-sm font-medium">
              {active ? "Nameservers and moved records" : "How to connect: one step at your registrar"}
            </summary>
            <div className="mt-4 space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium">At your registrar, replace the nameservers with these two</p>
                {nameservers.map((ns) => (
                  <CopyRow key={ns} value={ns} />
                ))}
                {!!domain.foundNameservers?.length && (
                  <p className="text-xs text-neutral-500">Now: {domain.foundNameservers.join(", ")}</p>
                )}
                <details className="rounded-lg bg-neutral-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm">Where to change them: steps for your registrar</summary>
                  <div className="mt-3">
                    <Guides guides={NS_GUIDES} />
                  </div>
                </details>
                <p className="text-sm text-neutral-600">
                  That&apos;s all. This page checks by itself (or press <b>Check now</b>). The website records and the
                  HTTPS certificate are set up automatically; www opens the same website.
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Your email keeps working</p>
                <Imports domain={domain} live={live} working={working} onAction={onAction} />
              </div>
            </div>
          </details>
        ) : (
          <details open={!active}>
            <summary className="cursor-pointer text-sm font-medium">
              {active ? "DNS records" : "Add these records at your domain registrar"}
            </summary>
            <div className="mt-4">{manual}</div>
          </details>
        )}

        {!active && (
          <details className="rounded-lg bg-neutral-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced options</summary>
            <div className="mt-4 space-y-3">
              {nsMode && (
                <details className="rounded-lg bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm">
                    Keep your current DNS and add the records by hand
                  </summary>
                  <div className="mt-4">{manual}</div>
                </details>
              )}
              <details className="rounded-lg bg-white px-4 py-3">
                <summary className="cursor-pointer text-sm">Cloudflare in one click</summary>
                <CloudflareForm domain={domain} working={working} onAction={onAction} />
              </details>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

export default function DomainSettings() {
  const [data, setData] = useState<Data | null>(null);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await call());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load domains.");
    }
  }, []);
  useEffect(() => {
    call()
      .then(setData)
      .catch((e) => setNotice(e instanceof Error ? e.message : "Could not load domains."));
  }, []);
  // Automatic check: while a domain is not connected, refresh every 30 s (the server
  // re-checks DNS in the background at most once a minute per domain).
  const waiting = data?.domains.some((d) => d.status !== "active");
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const act = async (domain: string, action: string, extra?: object) => {
    setBusy(`${domain}:${action}`);
    setNotice("");
    try {
      const result = await call({ action, domain, ...extra });
      if (action === "cloudflare")
        setNotice(
          result.changed?.length
            ? `Cloudflare records created: ${result.changed.join(", ")}.`
            : "Cloudflare already had the right records.",
        );
      await load();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy("");
    }
  };

  return (
    <AdminPanel
      title="Domain"
      className="space-y-6"
    >
      {data && data.domains.length < data.max && (
        <form
          className="rounded-xl border bg-white p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act(input, "add")) setInput("");
          }}
        >
          <div className="flex items-center gap-3">
            <Globe className="size-5 text-neutral-500" />
            <div>
              <h2 className="font-semibold">
                {data.domains.length ? "Add another domain" : "Connect your domain"}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Buy the domain at any registrar first. Enter it without https:// and www: www is
                connected automatically.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="domain-input">Your domain</Label>
              <Input
                id="domain-input"
                placeholder="zcena.com"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!input.trim() || !!busy}>
              {busy.endsWith(":add") ? "Connecting…" : "Connect domain"}
            </Button>
          </div>
        </form>
      )}
      {notice && (
        <p role="alert" className="rounded-lg bg-neutral-100 p-3 text-sm">
          {notice}
        </p>
      )}
      {!data && !notice && <p className="text-sm text-neutral-500">Loading domains…</p>}
      {data?.domains.map((domain) => (
        <DomainCard
          key={domain.domain}
          domain={domain}
          count={data.domains.length}
          busy={busy}
          live={data.live}
          onAction={(action, extra) => act(domain.domain, action, extra)}
        />
      ))}
      {data && (
        <p className="text-xs leading-5 text-neutral-500">
          Until a domain is connected the website stays available at /site/{data.site.key}/. A
          domain can belong to one website only.
          {data.provider === "local" ? " Development mode: DNS is checked, the hosting is not changed." : ""}
        </p>
      )}
    </AdminPanel>
  );
}
