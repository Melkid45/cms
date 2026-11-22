"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentSiteId, setCurrentSite } from "@/lib/builder/site-client";

export interface TeamNotification {
  id: string;
  at: string;
  kind: string;
  title: string;
  text: string;
  href?: string;
  // CRM notifications belong to one website; opening one switches to it.
  siteId?: string;
  read: boolean;
}

// Team notifications (owner + designers). Polls every minute while the tab is visible.
export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<TeamNotification[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/builder/notifications", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setItems(data);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load notifications.",
      );
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    tick();
    const timer = window.setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, load]);
  const mark = useCallback(async (ids: string[] | "all") => {
    setItems((current) =>
      current.map((item) =>
        ids === "all" || ids.includes(item.id) ? { ...item, read: true } : item,
      ),
    );
    try {
      await fetch("/api/builder/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // The next poll shows the server state again.
    }
  }, []);
  return {
    items,
    error,
    unread: items.filter((item) => !item.read).length,
    reload: load,
    mark,
  };
}

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function NotificationsPanel({
  state,
  onClose,
}: {
  state: ReturnType<typeof useNotifications>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { items, unread, error, mark, reload } = state;
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <div className="fixed inset-0 z-100 bg-[#f6f6f660]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Notifications"
        className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-[0_0_40px_rgb(0_0_0/0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <h3 className="text-sm font-semibold">
            Notifications
            {unread > 0 && (
              <span className="ml-2 text-neutral-400">{unread} new</span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!unread}
              onClick={() => void mark("all")}
            >
              Mark all as read
            </Button>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-black"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto bg-neutral-50 p-3">
          {error && <p className="p-2 text-sm text-red-600">{error}</p>}
          {!items.length && !error && (
            <p className="p-2 text-sm text-neutral-500">
              No notifications yet.
            </p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!item.read) void mark([item.id]);
                if (item.href) {
                  onClose();
                  if (item.siteId && item.siteId !== currentSiteId()) {
                    setCurrentSite(item.siteId);
                    window.location.assign(item.href);
                  } else router.push(item.href);
                }
              }}
              className={cn(
                "block w-full rounded-lg p-3 text-left transition-colors hover:bg-neutral-50",
                item.read ? "bg-white/60" : "bg-white",
              )}
            >
              <span className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    item.read ? "bg-transparent" : "bg-black",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      item.read ? "text-neutral-600" : "font-semibold",
                    )}
                  >
                    {item.title}
                  </span>
                  {item.text && (
                    <span className="mt-1 block break-words text-xs leading-5 text-neutral-500">
                      {item.text}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-neutral-400">
                    {time(item.at)}
                    {item.href && " · Open"}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
