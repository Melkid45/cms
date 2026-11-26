"use client";
import { Select, SelectOption } from "@/components/ui/select";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AdminPanel } from "@/components/admin/admin-panel";
import { cn } from "@/lib/utils";
import { withSite } from "@/lib/builder/site-client";
import {
  APPROVAL_TYPES,
  statusLabel,
  typeLabel,
  type ApprovalItem,
  type ApprovalSettings,
  type ApprovalsOverview,
  type ApprovalStatus,
} from "@/lib/builder/approvals/shared";

const card = "rounded-[20px] bg-white";
const field =
  "h-9 w-full rounded-lg bg-neutral-100 px-3 text-sm outline-none transition-shadow focus:bg-white focus:shadow-[0_0_0_2px_rgb(0_0_0/0.8)]";

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(withSite("/api/builder/approvals"), {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete this operation.");
  return data as T;
}
const post = <T,>(body: unknown) => request<T>({ method: "POST", body: JSON.stringify(body) });

const FILTERS: { id: string; label: string; match: (s: ApprovalStatus) => boolean }[] = [
  { id: "open", label: "Waiting", match: (s) => s === "pending" || s === "revising" || s === "working" || s === "failed" },
  { id: "approved", label: "Approved", match: (s) => s === "approved" },
  { id: "skipped", label: "Skipped", match: (s) => s === "skipped" },
  { id: "all", label: "All", match: () => true },
];
const tone: Record<ApprovalStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  revising: "bg-sky-50 text-sky-800",
  working: "bg-sky-50 text-sky-800",
  approved: "bg-emerald-50 text-emerald-800",
  skipped: "bg-neutral-100 text-neutral-500",
  failed: "bg-red-50 text-red-700",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Approvals() {
  const [data, setData] = useState<ApprovalsOverview | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [type, setType] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await request<ApprovalsOverview>());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => clearInterval(timer);
  }, [load]);
  const items = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    return (data?.items ?? []).filter((i) => f.match(i.status) && (!type || i.type === type));
  }, [data, filter, type]);
  const waiting = data ? data.counts.pending + data.counts.revising + data.counts.failed + data.counts.working : 0;

  return (
    <AdminPanel
      title="Approvals"
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <nav className="flex gap-1 overflow-x-auto" aria-label="Status">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors",
                    filter === f.id ? "bg-black text-white" : "bg-white text-neutral-600 hover:text-black",
                  )}
                >
                  {f.label}
                  {f.id === "open" && waiting > 0 && (
                    <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", filter === f.id ? "bg-white text-black" : "bg-amber-500 text-white")}>
                      {waiting}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <Select
              aria-label="Type"
              value={String(type)}
              onValueChange={(selectedValue) => setType(selectedValue)}
              className="h-9 "
            >
              <SelectOption value="">All types</SelectOption>
              {Object.entries(APPROVAL_TYPES).map(([id, label]) => (
                <SelectOption key={id} value={String(id)}>
                  {label}
                </SelectOption>
              ))}
            </Select>
          </div>
          {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
          {data && !items.length && (
            <div className={`${card} px-6 py-12 text-center`}>
              <p className="font-medium">{filter === "open" ? "Nothing waiting for you" : "Nothing here yet"}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
                New social posts for published products, SEO suggestions and other prepared texts appear here and in Telegram.
              </p>
            </div>
          )}
          <div className="space-y-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} awaiting={data?.telegram.awaiting?.itemId === item.id} onChange={load} />
            ))}
          </div>
        </div>
        {data && <SettingsPanel data={data} onChange={load} />}
      </div>
    </AdminPanel>
  );
}

function ItemCard({ item, awaiting, onChange }: { item: ApprovalItem; awaiting: boolean; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const closed = item.status === "approved" || item.status === "skipped";
  async function act(action: "approve" | "skip" | "revise") {
    setBusy(action);
    setError("");
    try {
      await post({ action, id: item.id, ...(action === "revise" ? { instruction } : {}) });
      if (action === "revise") {
        setEditing(false);
        setInstruction("");
      }
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }
  const long = item.text.length > 420;
  return (
    <article className={`${card} overflow-hidden`} data-approval={item.id}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        {item.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element -- media library URL
          <img src={item.images[0]} alt="" className="h-48 w-full shrink-0 rounded-lg bg-neutral-100 object-cover sm:h-40 sm:w-32" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className={cn("rounded-full px-2 py-0.5", tone[item.status])}>{awaiting ? "Waiting for your change" : statusLabel[item.status]}</span>
            <span>{typeLabel(item.type)}</span>
            {item.variant > 1 && <span>· variant {item.variant}</span>}
            <span>· {when(item.updatedAt)}</span>
            {item.sentAt && <span>· sent to Telegram</span>}
          </div>
          <h2 className="mt-2 font-semibold leading-snug [overflow-wrap:anywhere]">{item.title}</h2>
          <p className={cn("mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 [overflow-wrap:anywhere]", long && !open && "line-clamp-6")}>
            {item.text}
          </p>
          {long && (
            <button type="button" className="mt-1 text-sm text-neutral-500 underline-offset-4 hover:underline" onClick={() => setOpen(!open)}>
              {open ? "Show less" : "Show all"}
            </button>
          )}
          {item.result && closed && <p className="mt-3 text-sm text-emerald-700">{item.result}</p>}
          {item.error && !closed && <p className="mt-3 text-sm text-red-700">{item.error}</p>}
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          {!closed && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void act("approve")} disabled={!!busy || item.status === "working"}>
                <Check /> {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button variant="outline" onClick={() => void act("skip")} disabled={!!busy || item.status === "working"}>
                <SkipForward /> Skip
              </Button>
              <Button variant="ghost" onClick={() => setEditing(!editing)} disabled={!!busy || item.status === "working"}>
                <Pencil /> Edit
              </Button>
            </div>
          )}
          {editing && !closed && (
            <div className="mt-3 space-y-2">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="What should change? E.g. “shorter, friendlier, mention free delivery”"
                className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm outline-none focus:bg-white focus:shadow-[0_0_0_2px_rgb(0_0_0/0.8)]"
              />
              <Button onClick={() => void act("revise")} disabled={!!busy || instruction.trim().length < 2}>
                {busy === "revise" ? "Making a new variant…" : "Make a new variant"}
              </Button>
            </div>
          )}
          {item.history.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-neutral-500">History</summary>
              <ul className="mt-2 space-y-1 text-neutral-600">
                {item.history.slice(0, 12).map((h, n) => (
                  <li key={n} className="[overflow-wrap:anywhere]">
                    <span className="text-neutral-400">{when(h.at)}</span> · {h.by}: {h.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

const hours = Array.from({ length: 24 }, (_, h) => h);
function SettingsPanel({ data, onChange }: { data: ApprovalsOverview; onChange: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [chats, setChats] = useState(data.settings.extraChats.join(", "));
  const s = data.settings;
  async function save(patch: Partial<ApprovalSettings>) {
    setError("");
    setMessage("");
    try {
      await post({ action: "settings", revision: s.revision, ...patch });
      await onChange();
      setMessage("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }
  async function telegram(mode: string) {
    setError("");
    setMessage("");
    try {
      const r = await post<{ sent?: number; webhook?: boolean }>({ action: "telegram", mode });
      await onChange();
      setMessage(mode === "dispatch" ? `Sent: ${r.sent ?? 0}` : r.webhook ? "Webhook is on." : "Webhook is off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }
  const t = data.telegram;
  const row = "flex items-center justify-between gap-4 py-2.5";
  return (
    <aside className="space-y-5">
      <section className={`${card} p-5`}>
        <h2 className="font-semibold">Telegram</h2>
        {t.connected ? (
          <p className="mt-1 text-sm text-neutral-600">
            Items go to {t.botName || "your bot"}, chat {t.chatId}.{" "}
            {data.isOwner && <span className="text-neutral-400">Connection: {t.mode === "off" ? "not receiving button presses yet" : t.mode}.</span>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-600">
            Connect your own bot in{" "}
            <Link href="/dashboard/settings/crm" className="underline underline-offset-4">
              CRM settings
            </Link>{" "}
            (bot token + chat). The approvals use the same bot.
          </p>
        )}
        {t.lastError && <p className="mt-2 text-sm text-red-700">{t.lastError}</p>}
        <div className="mt-3">
          <label className={row}>
            <span className="text-sm">Send items to Telegram</span>
            <Switch checked={s.telegram} onCheckedChange={(v: boolean) => void save({ telegram: v })} />
          </label>
          <div className={row}>
            <span className="text-sm">Delivery</span>
            <Select className="h-9" value={String(s.delivery)} onValueChange={(selectedValue) => void save({ delivery: selectedValue as ApprovalSettings["delivery"] })}>
              <SelectOption value="instant">Each item at once</SelectOption>
              <SelectOption value="daily">Once a day</SelectOption>
            </Select>
          </div>
          {s.delivery === "daily" && (
            <div className={row}>
              <span className="text-sm">Daily at</span>
              <Select className="h-9" value={String(s.digestHour)} onValueChange={(selectedValue) => void save({ digestHour: Number(selectedValue) })}>
                {hours.map((h) => (
                  <SelectOption key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectOption>
                ))}
              </Select>
            </div>
          )}
          <label className={row}>
            <span className="text-sm">Quiet hours</span>
            <Switch checked={s.quiet} onCheckedChange={(v: boolean) => void save({ quiet: v })} />
          </label>
          {s.quiet && (
            <div className={row}>
              <span className="text-sm text-neutral-600">Nothing from</span>
              <span className="flex items-center gap-1.5 text-sm">
                <Select aria-label="Quiet from" className="h-9" value={String(s.quietFrom)} onValueChange={(selectedValue) => void save({ quietFrom: Number(selectedValue) })}>
                  {hours.map((h) => (
                    <SelectOption key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectOption>
                  ))}
                </Select>
                to
                <Select aria-label="Quiet to" className="h-9" value={String(s.quietTo)} onValueChange={(selectedValue) => void save({ quietTo: Number(selectedValue) })}>
                  {hours.map((h) => (
                    <SelectOption key={h} value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</SelectOption>
                  ))}
                </Select>
              </span>
            </div>
          )}
          <label className={row}>
            <span className="text-sm">Social post for every new product or work</span>
            <Switch checked={s.autoSocial} onCheckedChange={(v: boolean) => void save({ autoSocial: v })} />
          </label>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Times are in the website time zone (Settings). Edits you ask for are sent back right away.</p>
        {t.connected && (
          <Button variant="outline" className="mt-3" onClick={() => void telegram("dispatch")}>
            Send waiting items now
          </Button>
        )}
        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </section>

      {data.isOwner && (
        <section className={`${card} p-5`}>
          <h2 className="font-semibold">Administrator</h2>
          <label className={row}>
            <span className="text-sm">
              Test mode
              <span className="block text-xs text-neutral-500">Telegram messages are recorded here, AI answers are canned (no cost).</span>
            </span>
            <Switch checked={s.testMode} onCheckedChange={(v: boolean) => void save({ testMode: v })} />
          </label>
          <div className="py-2.5">
            <label className="mb-1 block text-xs text-neutral-500" htmlFor="extra-chats">
              More chats allowed to answer (ids, comma separated)
            </label>
            <div className="flex gap-2">
              <input id="extra-chats" className={field} value={chats} onChange={(e) => setChats(e.target.value)} placeholder="-1001234567890" />
              <Button
                variant="outline"
                onClick={() => void save({ extraChats: chats.split(/[\s,]+/).filter(Boolean) })}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="py-2.5 text-sm">
            <p className="text-neutral-600">
              Button presses reach the CMS through a webhook (needs a public https address) or, locally, the polling script{" "}
              <code className="rounded bg-neutral-100 px-1">.run/approvals/poll.mjs</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={!t.publicUrl || !t.connected} onClick={() => void telegram("webhook-on")}>
                Turn webhook on
              </Button>
              <Button variant="ghost" disabled={!t.connected || t.mode !== "webhook"} onClick={() => void telegram("webhook-off")}>
                Turn off
              </Button>
            </div>
            {!t.publicUrl && <p className="mt-2 text-xs text-neutral-500">No public https address here, so use polling.</p>}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {data.types.map((x) => (
              <li key={x.type} className="flex justify-between gap-3">
                <span>{x.label}</span>
                <span className={x.ready ? "text-emerald-700" : "text-neutral-400"}>{x.ready ? "connected" : "not yet"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.isOwner && s.testMode && (
        <section className={`${card} p-5`}>
          <h2 className="font-semibold">Test Telegram chat</h2>
          <p className="mt-1 text-xs text-neutral-500">What the bot would have sent (newest first).</p>
          <ul className="mt-3 space-y-3">
            {(data.outbox ?? []).slice(0, 12).map((m, n) => (
              <li key={n} className="rounded-lg bg-neutral-50 p-3 text-sm">
                <p className="text-xs text-neutral-400">
                  {m.method} · {when(m.at)}
                </p>
                {typeof (m.body.text ?? m.body.caption) === "string" && (
                  <p className="mt-1 line-clamp-5 whitespace-pre-wrap [overflow-wrap:anywhere]">{String(m.body.text ?? m.body.caption)}</p>
                )}
                {m.method === "answerCallbackQuery" && typeof m.body.text === "undefined" && <p className="mt-1">(button acknowledged)</p>}
                {Boolean((m.body.reply_markup as { inline_keyboard?: unknown[][] } | undefined)?.inline_keyboard?.length) && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {((m.body.reply_markup as { inline_keyboard: { text: string }[][] }).inline_keyboard[0] ?? []).map((b) => (
                      <span key={b.text} className="rounded-md bg-white px-2 py-1 text-xs shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
                        {b.text}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
            {!data.outbox?.length && <li className="text-sm text-neutral-500">Nothing sent yet.</li>}
          </ul>
        </section>
      )}
    </aside>
  );
}
