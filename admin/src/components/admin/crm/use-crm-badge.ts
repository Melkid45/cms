"use client";
import { useEffect, useState } from "react";
import { withSite } from "@/lib/builder/site-client";
import { CRM_CHANGED } from "./use-crm";

// Overdue CRM tasks of the selected website for the menu badge. Polls every minute while
// the tab is visible; the same request lets the server send reminders of due tasks.
export function useCrmBadge(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(withSite("/api/builder/crm/badge"), { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { overdue: number };
        if (live) setCount(data.overdue);
      } catch {
        // Keep the last number; the next poll tries again.
      }
    };
    void load();
    const timer = window.setInterval(load, 60000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(CRM_CHANGED, load);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(CRM_CHANGED, load);
    };
  }, [enabled]);
  return enabled ? count : 0;
}
