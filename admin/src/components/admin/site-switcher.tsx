"use client";

import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearCurrentSite, setCurrentSite } from "@/lib/builder/site-client";
import { confirmEditorLeave } from "@/components/builder/use-page-draft";
import type { Site } from "@/lib/builder/sites";

export const initialsOf = (name: string) =>
  name
    // Quotes and punctuation (SIA "ENRINA") are not initials.
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "W";

// Switches the remembered website and reloads, so every screen starts from its data.
export function switchSite(id: string, pathname: string) {
  if (!confirmEditorLeave()) return;
  setCurrentSite(id);
  window.location.assign(
    pathname.startsWith("/dashboard/pages/") ? "/dashboard/pages" : pathname,
  );
}

// Owner: leaves the client and goes back to the studio (clients table). A full reload,
// like switchSite, so no screen keeps the previous website's data.
export function exitClient(to = "/dashboard/clients") {
  if (!confirmEditorLeave()) return;
  clearCurrentSite();
  window.location.assign(to);
}

// Inline list of websites to switch between (the owner sees the open client's websites,
// a client or designer sees their own). No popup: it opens under the website card.
export function SitePicker({
  sites,
  current,
  pathname,
  onClose,
}: {
  sites: Site[];
  current?: string;
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div className="mt-1 space-y-0.5 rounded-xl bg-neutral-50 p-1">
      {sites.map((site) => (
        <button
          key={site.id}
          type="button"
          onClick={() =>
            site.id === current ? onClose() : switchSite(site.id, pathname)
          }
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white",
            site.id === current && "bg-white",
          )}
        >
          <Globe className="size-4 shrink-0 text-neutral-500" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{site.name}</span>
            <span className="block truncate text-xs text-neutral-500">
              /site/{site.key}
            </span>
          </span>
          {site.id === current && <Check className="size-4 shrink-0" />}
        </button>
      ))}
    </div>
  );
}
