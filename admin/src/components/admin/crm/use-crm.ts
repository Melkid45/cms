"use client";
import { useCallback, useEffect, useState } from "react";
import { withSite } from "@/lib/builder/site-client";
import type { CrmData } from "@/lib/builder/crm/shared";

// CRM data of the selected website and one function per change. Every change answers with
// fresh data, so the screens never drift from the server (revisions are checked there).
export const CRM_CHANGED = "cms:crm-changed";
export async function crmRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withSite(path), {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete this operation.");
  return data as T;
}
export function useCrm() {
  const [data, setData] = useState<CrmData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await crmRequest<CrmData>("/api/builder/crm"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the CRM.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);
  const act = useCallback(
    async <R = { id?: string }>(body: Record<string, unknown>): Promise<R | null> => {
      setBusy(true);
      setError("");
      try {
        const answer = await crmRequest<{ result: R; data: CrmData }>("/api/builder/crm", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setData(answer.data);
        window.dispatchEvent(new Event(CRM_CHANGED));
        return answer.result;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
        // A 409 means someone else changed it: show their version.
        void load();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  return { data, error, setError, busy, load, act };
}
export const personName = (data: CrmData | null, id: string) =>
  data?.team.find((m) => m.id === id)?.name || (id ? "Former member" : "Nobody");
export const formatDate = (iso: string, timeZone = "UTC", withTime = false) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        timeZone,
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "";
// <input type="datetime-local"> value ↔ ISO (browser time zone).
export const toLocalInput = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : "");
