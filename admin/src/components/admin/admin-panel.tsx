"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

// One admin screen = (optional KPI tiles +) ONE white container whose first line is the
// toolbar: tabs, filter chips, search, sort and action buttons. No visible page title: the
// sidebar shows where you are (Vova, 2026-11-22). The title stays for screen readers.
export function AdminPanel({
  title,
  toolbar,
  children,
  className,
}: {
  title: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("admin-panel rise-in min-w-0 rounded-[20px] bg-white p-5 sm:p-6", className)}
    >
      <h1 className="sr-only">{title}</h1>
      {toolbar && <Toolbar>{toolbar}</Toolbar>}
      {children}
    </section>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2.5">{children}</div>;
}

// Grouped content inside the container: a light grey sub-panel, no frame.
export const subPanel = "rounded-2xl bg-[#f5f5f5]";
// Records in a list: a very soft divider between rows, none after the last one. The only
// lines in the admin (Vova, 2026-11-22).
export const rowLine = "border-b border-[#efefef] last:border-b-0";
// 40 px controls shared by every toolbar.
export const chip = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors",
    active ? "bg-black text-white" : "bg-[#f5f5f5] text-neutral-700 hover:bg-[#efefef]",
  );

// Segmented control (Vova's reference, 2026-11-22): light grey rounded track, the active
// tab is a white pill with a very soft shadow, tabs share the width. Used for every section
// switch in the admin: Orders / Change requests, Pages / Trash, Billing, client popup.
export function Segmented({
  items,
  active,
  onSelect,
  tall,
  className,
}: {
  items: readonly (readonly [id: string, label: React.ReactNode, href?: string])[];
  active: string;
  onSelect?: (id: string) => void;
  // 48 px (client popup); toolbars use 44 px.
  tall?: boolean;
  className?: string;
}) {
  const item = (id: string) =>
    cn(
      "flex flex-1 items-center justify-center rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors",
      active === id
        ? "bg-neutral-900 text-white hover:bg-neutral-800"
        : "text-neutral-500 hover:text-black",
    );
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 rounded-2xl bg-[#f5f5f5] p-1", tall ? "h-12" : "h-11", className)}
    >
      {items.map(([id, label, href]) =>
        href ? (
          <Link key={id} href={href} role="tab" aria-selected={active === id} className={item(id)}>
            {label}
          </Link>
        ) : (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => onSelect?.(id)}
            className={item(id)}
          >
            {label}
          </button>
        ),
      )}
    </div>
  );
}

// Section tabs as links (e.g. Orders / Change requests).
export function PanelTabs({
  tabs,
  active,
}: {
  tabs: readonly (readonly [id: string, label: string, href: string])[];
  active: string;
}) {
  return <Segmented items={tabs} active={active} />;
}
