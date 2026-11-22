"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AdminPanel } from "@/components/admin/admin-panel";
import { overdue, type Stage } from "@/lib/builder/crm/shared";
import type { TelegramStatus } from "@/lib/builder/crm/telegram";
import { CrmTabs, ErrorLine, card, field, label } from "./crm-ui";
import { crmRequest, formatDate, useCrm } from "./use-crm";

export function CrmSettings() {
  const crm = useCrm();
  return (
    <AdminPanel
      title="CRM settings"
    >
      <CrmTabs overdue={crm.data?.tasks.filter((t) => overdue(t)).length ?? 0} />
      <div className="grid gap-5 xl:grid-cols-2">
        <TelegramSettings />
        <div className="space-y-5">
          <PipelineSettings crm={crm} />
        </div>
      </div>
    </AdminPanel>
  );
}

function TelegramSettings() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [events, setEvents] = useState({ enquiry: true, order: true, task: true, booking: true });
  const [chats, setChats] = useState<{ id: string; title: string }[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = (s: TelegramStatus) => {
    setStatus(s);
    setChatId(s.chatId);
    setEvents(s.events);
    setToken("");
  };
  const load = useCallback(async () => {
    try {
      apply(await crmRequest<TelegramStatus>("/api/builder/crm/telegram"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);
  async function run<T>(fn: () => Promise<T>, done?: (r: T) => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fn();
      done?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  const save = (disconnect = false) =>
    run(
      () =>
        crmRequest<TelegramStatus>("/api/builder/crm/telegram", {
          method: "PUT",
          body: JSON.stringify({ ...(token.trim() ? { token: token.trim() } : {}), chatId: chatId.trim(), events, revision: status?.revision ?? 0, disconnect }),
        }),
      (s) => {
        apply(s);
        setMessage(disconnect ? "Telegram disconnected." : "Saved.");
      },
    );
  return (
    <section className={`${card} p-5 sm:p-6`}>
      <h2 className="text-base font-semibold">Telegram notifications</h2>
      <p className="mt-1 text-sm text-neutral-500">
        New enquiries, shop orders and due tasks come as a message to your own Telegram bot. It is free and takes two minutes.
      </p>
      <ol className="my-4 list-decimal space-y-1.5 rounded-lg bg-neutral-50 p-4 pl-8 text-sm text-neutral-700">
        <li>
          In Telegram open <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, send <code>/newbot</code>, choose a name. It answers with a token like <code>123456789:AA…</code>.
        </li>
        <li>Paste the token below.</li>
        <li>
          Open your new bot and press <b>Start</b> (for a group: add the bot to the group and write any message there).
        </li>
        <li>Press <b>Find my chat</b>, pick the chat, then <b>Send test message</b> and <b>Save</b>.</li>
      </ol>
      <ErrorLine error={error} />
      {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      <div className="space-y-3">
        <div>
          <label className={label} htmlFor="tg-token">Bot token</label>
          <input
            id="tg-token"
            className={field}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={status?.connected || status?.botName ? `Saved${status.botName ? ` (${status.botName})` : ""} — paste a new one to replace` : "123456789:AA…"}
          />
        </div>
        <div>
          <label className={label} htmlFor="tg-chat">Chat id</label>
          <div className="flex gap-2">
            <input id="tg-chat" className={field} value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  () => crmRequest<{ chats: { id: string; title: string }[] }>("/api/builder/crm/telegram", { method: "POST", body: JSON.stringify({ action: "detect", ...(token.trim() ? { token: token.trim() } : {}) }) }),
                  (r) => {
                    setChats(r.chats);
                    if (r.chats.length === 1) setChatId(r.chats[0].id);
                  },
                )
              }
            >
              Find my chat
            </Button>
          </div>
          {chats && (
            <div className="mt-2 space-y-1">
              {!chats.length && <p className="text-xs text-neutral-500">No messages yet. Press Start in your bot (or write in the group), then try again.</p>}
              {chats.map((c) => (
                <button key={c.id} type="button" onClick={() => setChatId(c.id)} className="block w-full rounded-lg bg-neutral-50 px-3 py-2 text-left text-sm hover:bg-neutral-100">
                  {c.title} <span className="text-xs text-neutral-500">{c.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <fieldset className="space-y-2 pt-1">
          <legend className={label}>Send a message about</legend>
          {(
            [
              ["enquiry", "New enquiries"],
              ["order", "New shop orders"],
              ["task", "Tasks that are due"],
              ["booking", "Online bookings (new and cancelled)"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {text}
              <Switch checked={events[key]} onCheckedChange={(v: boolean) => setEvents((e) => ({ ...e, [key]: v }))} />
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button disabled={busy || (!token.trim() && !status?.botName) || !chatId.trim()} onClick={() => void save()}>
            Save
          </Button>
          <Button
            variant="outline"
            disabled={busy || (!token.trim() && !status?.botName) || !chatId.trim()}
            onClick={() =>
              void run(
                () => crmRequest("/api/builder/crm/telegram", { method: "POST", body: JSON.stringify({ action: "test", ...(token.trim() ? { token: token.trim() } : {}), chatId: chatId.trim() }) }),
                () => setMessage("Test message sent. Check Telegram."),
              )
            }
          >
            Send test message
          </Button>
          {status?.botName && (
            <Button variant="ghost" className="text-red-600 hover:bg-red-50" disabled={busy} onClick={() => confirm("Stop Telegram notifications and forget the token?") && void save(true)}>
              Disconnect
            </Button>
          )}
        </div>
        {status && (
          <p className="text-xs text-neutral-500">
            {status.connected ? `Connected${status.botName ? ` to ${status.botName}` : ""}.` : "Not connected."}
            {status.lastSentAt && ` Last message: ${formatDate(status.lastSentAt, undefined, true)}.`}
            {status.lastError && ` Last problem: ${status.lastError}`}
          </p>
        )}
      </div>
    </section>
  );
}

function PipelineSettings({ crm }: { crm: ReturnType<typeof useCrm> }) {
  const { data, busy, act, error } = crm;
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [saved, setSaved] = useState("");
  const list = stages ?? data?.stages ?? [];
  const edit = (next: Stage[]) => {
    setSaved("");
    setStages(next);
  };
  const move = (i: number, d: number) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    edit(next);
  };
  if (!data) return <section className={`${card} p-5 text-sm text-neutral-500`}>{error || "Loading…"}</section>;
  return (
    <>
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="text-base font-semibold">New enquiries</h2>
        <label className="mt-3 flex items-center justify-between gap-4 text-sm">
          <span>
            Create a deal for every new enquiry
            <span className="block text-xs text-neutral-500">It lands in the first stage; the contact is created either way.</span>
          </span>
          <Switch
            checked={data.settings.autoDeal}
            disabled={busy}
            onCheckedChange={(v: boolean) => void act({ action: "settings.save", revision: data.settingsRevision, settings: { ...data.settings, autoDeal: v } })}
          />
        </label>
        <label className="mt-4 flex items-center justify-between gap-4 text-sm">
          <span>Currency of new deals</span>
          <select
            className={`${field} max-w-28`}
            value={data.settings.currency}
            disabled={busy}
            onChange={(e) => void act({ action: "settings.save", revision: data.settingsRevision, settings: { ...data.settings, currency: e.target.value } })}
          >
            {[...new Set(["EUR", "USD", "GBP", "PLN", "SEK", "NOK", "DKK", "CHF", data.settings.currency])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </section>
      <section className={`${card} p-5 sm:p-6`}>
        <h2 className="text-base font-semibold">Pipeline stages</h2>
        <p className="mt-1 text-sm text-neutral-500">Rename, add or reorder. Deals of a removed stage move to the first open stage.</p>
        <ErrorLine error={error} />
        <div className="mt-4 space-y-2">
          {list.map((s, i) => (
            <div key={s.id || i} className="flex items-center gap-2">
              <input aria-label="Stage name" className={field} value={s.name} maxLength={40} onChange={(e) => edit(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <select aria-label="Stage type" className={`${field} w-28`} value={s.kind} onChange={(e) => edit(list.map((x, j) => (j === i ? { ...x, kind: e.target.value as Stage["kind"] } : x)))}>
                <option value="open">Open</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
              <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Remove stage" disabled={list.length <= 2} onClick={() => edit(list.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={list.length >= 12} onClick={() => edit([...list, { id: "", name: "New stage", kind: "open" }])}>
            <Plus /> Add stage
          </Button>
          <Button
            disabled={busy || !stages || list.some((s) => !s.name.trim())}
            onClick={async () => {
              const r = await act({ action: "stages.save", revision: data.stagesRevision, stages: list.map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name.trim(), kind: s.kind })) });
              if (r) {
                setStages(null);
                setSaved("Stages saved.");
              }
            }}
          >
            Save stages
          </Button>
          {stages && (
            <Button variant="ghost" onClick={() => setStages(null)}>
              Undo changes
            </Button>
          )}
        </div>
        {saved && <p className="mt-3 text-sm text-emerald-700">{saved}</p>}
      </section>
    </>
  );
}
