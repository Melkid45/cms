"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccess } from "@/components/admin/access-context";
import { cn } from "@/lib/utils";
import { AdminPanel, rowLine, subPanel } from "@/components/admin/admin-panel";
import { STEPS, type Step } from "@/lib/builder/onboarding/shared";

interface Row {
  id: string;
  business: string;
  siteKey: string;
  orderId?: string;
  step: Step;
  stepIndex: number;
  test: boolean;
  mock: boolean;
  pending: number;
  approved: number;
  pages: number;
  languages: string[];
  ai: { calls: number; cost: number };
  updatedAt: string;
}

export function OnboardingList() {
  const { isOwner } = useAccess();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const load = () =>
    fetch("/api/builder/onboarding", { cache: "no-store" })
      .then(async (r) => (r.ok ? setRows(await r.json()) : setError((await r.json()).error || "Could not load.")))
      .catch(() => setError("No connection."));
  useEffect(() => {
    void load();
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/builder/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business: name.trim(), mock, test: mock }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not start.");
      setLink(`${window.location.origin}/onboarding/${data.id}#t=${encodeURIComponent(data.token)}`);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminPanel
      title="Onboarding"
      toolbar={
        isOwner && (
          <>
            {/* Starts a company + draft website; orders from /order start on their own. */}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New customer: business name"
              aria-label="Business name"
              className="h-10 min-w-0 flex-1 basis-full rounded-lg border border-[#e2e2e2] bg-white px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:basis-60"
            />
            <label className="flex h-10 items-center gap-2.5 text-sm">
              <Switch checked={mock} onCheckedChange={setMock} />
              Test (simulated AI, no cost)
            </label>
            <Button className="h-10 px-4" disabled={busy || name.trim().length < 2} onClick={start}>
              {busy && <Loader2 className="animate-spin" />} Start onboarding
            </Button>
          </>
        )
      }
    >
      {link && (
        <div className={cn(subPanel, "mb-5 p-4 text-sm")}>
          <p className="font-medium">Private client link (shown once):</p>
          <p className="mt-1 break-all font-mono text-[13px]">{link}</p>
        </div>
      )}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {!rows ? (
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : !rows.length ? (
        <p className="text-sm text-neutral-500">No onboardings yet.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)]">
          {rows.map((row) => (
            <li key={row.id} className={rowLine}>
              <Link href={`/dashboard/onboarding/${row.id}`} className="group flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium underline-offset-4 group-hover:underline">
                    {row.business}
                    {row.test && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">test</span>}
                  </p>
                  <p className="text-sm text-neutral-500">
                    /site/{row.siteKey} · {row.pages} pages · {row.languages.map((l) => l.toUpperCase()).join(", ") || "—"} · AI ${row.ai.cost.toFixed(4)} ({row.ai.calls})
                    {row.pending ? ` · ${row.pending} blocks waiting` : ""}
                  </p>
                </div>
                <ol className="hidden items-center gap-1 sm:flex" aria-label="Progress">
                  {STEPS.map((s, i) => (
                    <li
                      key={s.id}
                      title={s.label}
                      className={cn(
                        "h-1.5 w-8 rounded-full",
                        i < row.stepIndex || row.step === "live" ? "bg-[#1d1d1b]" : i === row.stepIndex ? "bg-[#1d1d1b]/50" : "bg-neutral-200",
                      )}
                    />
                  ))}
                </ol>
                <span className="w-24 shrink-0 text-right text-sm font-medium">{STEPS[row.stepIndex]?.label}</span>
                <ChevronRight className="size-4 shrink-0 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
