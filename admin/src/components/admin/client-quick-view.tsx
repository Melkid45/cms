"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Pin, PinOff, Plus, X } from "lucide-react";
import { initialsOf, switchSite } from "./site-switcher";
import { toneClass } from "./status-tone";
import { Segmented } from "./admin-panel";
import {
  ClientName,
  ClientTabContent,
  IconAction,
  StatusBadge,
  clientBilling,
  publicUrl,
  send,
  siteStatus,
} from "./client-manage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Company, Site } from "@/lib/builder/sites";
import type { StudioAccount, StudioData } from "@/lib/builder/studio";

const money = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Live preview of a public website in a light browser-window mock: slim grey bar with three
// dots and the real address (test /site/<key> or the live domain), scaled page below.
function SitePreview({ site, data }: { site: Site; data: StudioData }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => setScale(element.clientWidth / 1280);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const info = data.sites[site.id];
  const url = publicUrl(site, info);
  // Opened only on click, so this always renders in the browser.
  const shown = url.startsWith("/") ? location.host + url : url.replace(/^https:\/\//, "");
  const draft = siteStatus(info) === "draft";
  return (
    <div className="flex h-[70vh] min-h-80 flex-col overflow-hidden rounded-2xl border border-[#e2e2e2] lg:h-full">
      <div className="flex h-11 shrink-0 items-center gap-3 bg-[#f5f5f5] px-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#d9d9d9]" />
          <span className="size-2.5 rounded-full bg-[#d9d9d9]" />
          <span className="size-2.5 rounded-full bg-[#d9d9d9]" />
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-3 text-[13px] text-neutral-600 hover:text-black"
        >
          <span className="min-w-0 flex-1 truncate">{shown}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden bg-white">
        {draft ? (
          <p className="grid h-full place-items-center p-6 text-center text-sm text-neutral-500">
            Nothing is published on this website yet.
          </p>
        ) : (
          <iframe
            key={site.id}
            title={`Preview of ${site.name}`}
            src={`/site/${site.key}`}
            loading="lazy"
            tabIndex={-1}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
            style={{ width: 1280, height: `${100 / scale}%`, transform: `scale(${scale})` }}
          />
        )}
      </div>
    </div>
  );
}

// One website in the popup list (selected = white with a soft shadow): logo, name + Test/Live, debt badge on the
// title line (nothing when all is paid), address with copy, compact facts line.
function SiteBlock({
  site,
  data,
  selected,
  open,
  onSelect,
}: {
  site: Site;
  data: StudioData;
  selected: boolean;
  open: boolean;
  onSelect: () => void;
}) {
  const info = data.sites[site.id];
  const [copied, setCopied] = useState(false);
  const billing = clientBilling([site], data);
  const url = publicUrl(site, info);
  const full = url.startsWith("/") ? location.origin + url : url;
  const hosting =
    info?.subscription === "overdue" || info?.subscription === "suspended"
      ? { text: `Hosting ${info.subscription}`, tone: "text-red-600" }
      : info?.paidUntil
        ? { text: `Hosting paid until ${shortDay(info.paidUntil)}`, tone: "" }
        : null;
  const facts = [
    info?.pages ? `${info.pages} ${info.pages === 1 ? "page" : "pages"}` : "",
    info?.languages?.length ? info.languages.map((l) => l.toUpperCase()).join(" · ") : "",
    info?.publishedAt ? `Published ${shortDay(info.publishedAt)}` : "Not published",
  ].filter(Boolean);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => event.key === "Enter" && onSelect()}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl p-3.5 transition-colors",
        selected ? "bg-white shadow-[0_1px_3px_rgb(0_0_0/0.06)]" : "hover:bg-[#efefef]",
      )}
    >
      <span
        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-xs font-semibold text-neutral-500 shadow-[0_0_0_1px_#e2e2e2]"
        style={info?.logo && info.color ? { background: info.color } : undefined}
      >
        {info?.logo && /^(\/|https?:)/.test(info.logo) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.logo} alt="" className="max-h-8 max-w-9 object-contain" />
        ) : (
          initialsOf(site.name)
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-medium">{site.name}</span>
          <StatusBadge info={info} />
          {billing.count > 0 && (
            <span
              className={cn(
                "ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                toneClass[billing.overdue ? "critical" : "progress"],
              )}
            >
              {money(billing.total)}
            </span>
          )}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-[13px] text-neutral-500">
          <span className="truncate">
            {info?.domain ?? `/site/${site.key}`}
            {open ? " · open now" : ""}
          </span>
          <button
            type="button"
            aria-label="Copy address"
            title={copied ? "Copied" : "Copy address"}
            onClick={(event) => {
              event.stopPropagation();
              navigator.clipboard?.writeText(full).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-[#efefef] hover:text-black"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          {copied && <span className="text-xs text-emerald-600">Copied</span>}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-neutral-500">
          {facts.join(" · ")}
          {hosting && <span className={hosting.tone}> · {hosting.text}</span>}
        </p>
      </div>
    </div>
  );
}

// Quick view of a client from the studio list (Vova, 2026-11-22): nearly full height popup.
// Header: name (pencil), meta, "Manage client" (enters the client), pin, close. Left: the
// client's websites as selectable blocks, an "Add website" tile, unpaid invoices; at the
// bottom only the selected website's "Open website". Right: tall live preview. Logins are
// managed inside the client (Client page), not here. Full screen on phones.
export function ClientQuickView({
  company,
  sites,
  data,
  accounts,
  onAccount,
  currentId,
  onClose,
  onAddWebsite,
  onRenamed,
}: {
  company: Company;
  sites: Site[];
  data: StudioData;
  accounts: StudioAccount[];
  onAccount: (account: StudioAccount) => void;
  currentId?: string;
  onClose: () => void;
  onAddWebsite: () => void;
  onRenamed: () => void;
}) {
  const [selected, setSelected] = useState(sites[0]?.id ?? "");
  const site = sites.find((item) => item.id === selected) ?? sites[0];
  const [tab, setTab] = useState<"websites" | "billing">("websites");
  const billing = clientBilling(sites, data);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Dialogs opened from here handle their own Esc first.
      if (event.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]'))
        onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 sm:p-6" onClick={onClose}>
      <div
        role="region"
        aria-label={`Client ${company.name}`}
        className="flex h-full w-full flex-col overflow-y-auto bg-white p-5 shadow-[0_24px_80px_rgb(0_0_0/0.2)] sm:h-[calc(100vh-48px)] sm:max-w-[1040px] sm:rounded-[20px] sm:p-9 lg:overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2">
            <ClientName company={company} onRenamed={onRenamed} />
            <span className="text-[13px] text-neutral-400">
              client since {day(company.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {sites[0] && (
              <Button
                className="mr-1 h-10 px-4"
                onClick={() => switchSite((site ?? sites[0]).id, "/dashboard/client")}
              >
                Manage client <ArrowRight />
              </Button>
            )}
            <IconAction
              label={company.pinned ? "Unpin from the top" : "Pin to the top of the list"}
              onClick={() =>
                send("/api/builder/sites", "POST", {
                  action: "pin-company",
                  id: company.id,
                  pinned: !company.pinned,
                }).then(onRenamed)
              }
            >
              {company.pinned ? <PinOff /> : <Pin />}
            </IconAction>
            <IconAction label="Close" onClick={onClose}>
              <X />
            </IconAction>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col">
            <Segmented
              tall
              className="mb-4"
              items={[
                ["websites", "Websites"],
                ["billing", billing.count ? `Billing · ${billing.count}` : "Billing"],
              ]}
              active={tab}
              onSelect={(id) => setTab(id as "websites" | "billing")}
            />
            <div className="min-h-0 flex-1 space-y-2 lg:overflow-y-auto">
              {tab === "billing" ? (
                <div>
                  <ClientTabContent
                    tab="billing"
                    company={company}
                    sites={sites}
                    data={data}
                    accounts={accounts}
                    onAccount={onAccount}
                    currentId={currentId}
                  />
                </div>
              ) : (
              <>
              {sites.length > 0 && (
              <div className="space-y-1 rounded-2xl bg-[#f5f5f5] p-1">
              {sites.map((item) => (
                <SiteBlock
                  key={item.id}
                  site={item}
                  data={data}
                  selected={item.id === site?.id}
                  open={item.id === currentId}
                  onSelect={() => setSelected(item.id)}
                />
              ))}
              </div>
              )}
              <button
                type="button"
                onClick={onAddWebsite}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d4d4d4] text-sm font-medium text-neutral-600 transition-colors hover:bg-[#fafafa] hover:text-black"
              >
                <Plus className="size-4" /> Add website
              </button>
              </>
              )}
            </div>
            {/* Bottom: the action of the selected website only. */}
            {site && (
              <Button
                variant="outline"
                className="mt-4 h-12 w-full border border-[#e2e2e2] bg-white text-[15px] hover:bg-[#fafafa]"
                nativeButton={false}
                render={<a href={publicUrl(site, data.sites[site.id])} target="_blank" rel="noreferrer" />}
              >
                Open website <ExternalLink />
              </Button>
            )}
          </div>
          {site ? (
            <SitePreview site={site} data={data} />
          ) : (
            <p className="grid min-h-60 place-items-center rounded-2xl border border-[#e2e2e2] text-sm text-neutral-500">
              Add a website to see its preview here.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
