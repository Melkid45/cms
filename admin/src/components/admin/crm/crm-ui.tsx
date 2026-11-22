"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ContactStatus } from "@/lib/builder/crm/shared";

export const card = "rounded-[20px] bg-white";
export const field =
  "h-9 w-full rounded-lg bg-neutral-100 px-3 text-sm outline-none transition-shadow focus:bg-white focus:shadow-[0_0_0_2px_rgb(0_0_0/0.8)]";
export const label = "mb-1 block text-xs text-neutral-500";

const tabs = [
  { href: "/dashboard/crm", label: "Contacts", exact: true },
  { href: "/dashboard/crm/pipeline", label: "Deals" },
  { href: "/dashboard/crm/tasks", label: "Tasks" },
  { href: "/dashboard/settings/crm", label: "CRM settings" },
];
export function CrmTabs({ overdue = 0 }: { overdue?: number }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto" aria-label="CRM">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href || (/^\/dashboard\/crm\/[^/]+$/.test(pathname) && !tabs.some((t) => t.href === pathname))
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors",
              active ? "bg-black text-white" : "bg-white text-neutral-600 hover:text-black",
            )}
          >
            {tab.label}
            {tab.label === "Tasks" && overdue > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-white text-black" : "bg-red-600 text-white")}>
                {overdue}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

const statusTone: Record<ContactStatus, string> = {
  lead: "bg-amber-50 text-amber-800",
  active: "bg-sky-50 text-sky-800",
  customer: "bg-emerald-50 text-emerald-800",
  inactive: "bg-neutral-100 text-neutral-500",
};
export function StatusPill({ status }: { status: ContactStatus }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs", statusTone[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{children}</span>;
}

export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-100 grid place-items-center overflow-y-auto bg-black/20 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={cn(card, "w-full p-5 sm:p-6", wide ? "max-w-2xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-black"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function ErrorLine({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  );
}
