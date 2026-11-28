"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import {
  SUGGESTION_TYPES,
  riskLabel,
  type AssistantRun,
  type AssistantSettings,
  type MonthlyReport,
  type Suggestion,
  type SuggestionType,
} from "@/lib/builder/seo/assistant-shared";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface Overview {
  site: { id: string; key: string; name: string };
  pack: boolean;
  role: "super-admin" | "designer" | "client";
  canRun: boolean;
  canSettings: boolean;
  settings: AssistantSettings;
  ai: { enabled: boolean; model: string };
  month: { id: string; cost: number; calls: number };
  scores: Record<string, number>;
  suggestions: Suggestion[];
  runs: AssistantRun[];
  reports: Record<string, { sentAt?: string; result?: string }>;
}
const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(5) : n.toFixed(n < 1 ? 4 : 2)}`;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

// Word-level diff (LCS) for the before/after view; long texts fall back to plain blocks.
function wordDiff(before: string, after: string) {
  const a = before.split(/(\s+)/),
    b = after.split(/(\s+)/);
  if (a.length * b.length > 400000) return null;
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: string; k: "same" | "del" | "add" }[] = [];
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ t: a[i++], k: "same" });
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: a[i++], k: "del" });
    else out.push({ t: b[j++], k: "add" });
  }
  while (i < a.length) out.push({ t: a[i++], k: "del" });
  while (j < b.length) out.push({ t: b[j++], k: "add" });
  return out;
}
function Diff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => (before && after ? wordDiff(before, after) : null), [before, after]);
  // New content (FAQ, empty alt): only the new text.
  if (!before.trim())
    return (
      <div className="rounded-lg bg-emerald-50/60 p-3">
        <p className="mb-1 text-xs text-neutral-500">New</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-900">{after}</p>
      </div>
    );
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-lg bg-neutral-50 p-3">
        <p className="mb-1 text-xs text-neutral-500">Before</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
          {parts
            ? parts.filter((p) => p.k !== "add").map((p, n) => (p.k === "del" ? <del key={n} className="rounded bg-red-100 text-red-800 decoration-red-400">{p.t}</del> : <span key={n}>{p.t}</span>))
            : before || <span className="text-neutral-400">(empty)</span>}
        </p>
      </div>
      <div className="rounded-lg bg-emerald-50/60 p-3">
        <p className="mb-1 text-xs text-neutral-500">After</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-900">
          {parts
            ? parts.filter((p) => p.k !== "del").map((p, n) => (p.k === "add" ? <ins key={n} className="rounded bg-emerald-100 text-emerald-900 no-underline">{p.t}</ins> : <span key={n}>{p.t}</span>))
            : after}
        </p>
      </div>
    </div>
  );
}

const statusText: Record<Suggestion["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  undone: "Undone",
  stale: "Out of date",
};

function SuggestionCard({
  s,
  busy,
  canDecide,
  onDecide,
  onRevise,
}: {
  s: Suggestion;
  busy: boolean;
  canDecide: boolean;
  onDecide: (action: "approve" | "reject" | "undo", edits?: Record<string, string>) => void;
  onRevise: (change: number, instruction: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const advice = !s.changes.length;
  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]" id={`suggestion-${s.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {SUGGESTION_TYPES[s.type].label}
            <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-normal text-neutral-600">{s.locale.toUpperCase()}</span>
          </p>
          <Link href={`/dashboard/pages/${s.pageSlug}`} className="text-xs text-neutral-500 underline-offset-2 hover:underline">
            {s.pageTitle}
          </Link>
        </div>
        <p className="text-xs text-neutral-500">
          <span className={s.risk === "low" ? "text-emerald-700" : s.risk === "high" ? "text-amber-700" : ""}>{riskLabel[s.risk]}</span>
          {" · "}impact {s.impact}
          {s.status !== "pending" && (
            <>
              {" · "}
              {statusText[s.status]}
              {s.decidedBy ? ` by ${s.decidedBy}` : ""} {when(s.decidedAt)}
              {s.status === "approved" && (s.published ? " (published)" : " (draft)")}
            </>
          )}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{s.reason}</p>
      {s.flags.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {s.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {s.changes.map((c, n) => (
        <div key={n} className="space-y-1.5">
          {s.changes.length > 1 || c.target.kind !== "seo" ? <p className="text-xs font-medium text-neutral-600">{c.label}</p> : null}
          {editing && c.editable ? (
            <Textarea
              value={edits[n] ?? c.after}
              onChange={(e) => setEdits({ ...edits, [n]: e.target.value })}
              rows={Math.min(12, Math.max(2, Math.ceil((edits[n] ?? c.after).length / 80) + (edits[n] ?? c.after).split("\n").length))}
            />
          ) : (
            <Diff before={c.before} after={c.after} />
          )}
          {editing && (c.target.kind === "faq-add" || c.target.kind === "section-add") && (
            <p className="text-xs text-neutral-500">Question on the first line, answer below it, an empty line between questions.</p>
          )}
        </div>
      ))}
      {s.revisions?.length ? (
        <p className="text-xs text-neutral-500">Revised: {s.revisions.map((r) => `“${r.instruction}”`).join(", ")}</p>
      ) : null}
      {canDecide && s.status === "pending" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => onDecide("approve", editing ? edits : undefined)}>
              <Check /> {advice ? "Mark as done" : editing ? "Approve edited" : "Approve"}
            </Button>
            {!advice && s.changes.some((c) => c.editable) && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>
                <Pencil /> {editing ? "Show diff" : "Edit"}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide("reject")}>
              <X /> Reject
            </Button>
          </div>
          {!advice && s.changes.some((c) => c.editable) && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (instruction.trim().length > 1) onRevise(Math.max(0, s.changes.findIndex((c) => c.editable)), instruction.trim());
                setInstruction("");
              }}
            >
              <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ask AI to change it, e.g. “shorter”, “mention Riga”" className="h-7 min-w-0 flex-1 text-xs" maxLength={500} />
              <Button size="sm" variant="outline" type="submit" disabled={busy || instruction.trim().length < 2}>
                <Sparkles /> Revise
              </Button>
            </form>
          )}
        </div>
      )}
      {canDecide && s.status === "approved" && s.changes.length > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide("undo")}>
          <RotateCcw /> Undo (restore previous value)
        </Button>
      )}
    </div>
  );
}

// Dashboard → SEO → AI SEO assistant: approval queue, history with undo, runs and cost,
// monthly report, settings. Nothing is changed on a page without an approval here.
export function SeoAssistant() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"pending" | "history" | "report">("pending");
  const [type, setType] = useState<SuggestionType | "">("");
  const [lang, setLang] = useState("");
  const [publish, setPublish] = useState<boolean | null>(null);
  const [pages, setPages] = useState(0);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportMonth, setReportMonth] = useState("");
  const load = useCallback(
    () =>
      fetch(withSite("/api/builder/seo/assistant"), { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) setError(body.error || "Could not load the SEO assistant.");
          else {
            setData(body);
            setError("");
          }
        })
        .catch(() => setError("Could not load the SEO assistant.")),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const loadReport = useCallback(async (month: string) => {
    const response = await fetch(withSite(`/api/builder/seo/assistant?view=report${month ? `&month=${month}` : ""}`), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) setError(body.error);
    else setReport(body.report);
  }, []);

  async function post(payload: Record<string, unknown>, done?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(withSite("/api/builder/seo/assistant"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed.");
      if (body.run) {
        const r = body.run as AssistantRun;
        setNotice(`Checked ${r.pages} pages (${r.aiPages} with AI, ${r.cachedPages} unchanged): ${r.suggestions} new suggestions, cost ${usd(r.cost)}${r.mock ? " (test mode)" : ""}.${r.stopped ? ` ${r.stopped}` : ""}`);
      } else if (done) setNotice(done);
      await load();
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-neutral-500">{error || "Loading…"}</p>;
  const doPublish = publish ?? data.settings.publish;
  const canDecide = data.role !== "client" || data.pack;
  const pending = data.suggestions.filter((s) => s.status === "pending");
  const history = data.suggestions.filter((s) => s.status !== "pending");
  const shown = (tab === "pending" ? pending : history).filter((s) => (!type || s.type === type) && (!lang || s.locale === lang));
  const bulk = pending.filter((s) => SUGGESTION_TYPES[s.type].bulk && s.risk === "low" && !s.flags.some((f) => !f.startsWith("Test mode:")) && (!type || s.type === type) && (!lang || s.locale === lang));
  const types = [...new Set((tab === "pending" ? pending : history).map((s) => s.type))];
  const langs = [...new Set(data.suggestions.map((s) => s.locale))];
  const approvedThisMonth = history.filter((s) => s.status === "approved" && s.decidedAt?.startsWith(data.month.id)).length;
  const scoreBefore = data.scores[data.month.id];
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs transition-colors ${active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`;

  return (
    <AdminPanel
      title="SEO assistant"
      className="w-full space-y-6"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          data.role !== "client" ? (
            <Link href="/dashboard/seo" className="text-sm underline-offset-2 hover:underline">
              Back to SEO
            </Link>
          ) : undefined
        }</div>}
    >
      {!data.pack && (
        <Card>
          <CardContent className="pt-6 text-sm text-neutral-600">The SEO assistant is part of the SEO pack. Switch the pack on in Dashboard → SEO.</CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Waiting for approval", value: String(pending.length) },
          { label: "Approved this month", value: String(approvedThisMonth) },
          { label: "AI cost this month", value: `${usd(data.month.cost)} / ${usd(data.settings.budgetUsd)}`, note: `${data.month.calls} calls · ${data.ai.model}${data.settings.testMode ? " · test mode" : ""}` },
          { label: "Runs", value: String(data.runs.length), note: data.runs[0] ? `last ${when(data.runs[0].at)}, ${usd(data.runs[0].cost)}` : "not run yet" },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent className="space-y-1 pt-6">
              <p className="text-xs text-neutral-500">{tile.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
              {tile.note && <p className="truncate text-xs text-neutral-500">{tile.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {data.canRun && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div className="w-full min-w-0 text-sm text-neutral-600 sm:w-auto sm:flex-1">
              <p className="font-medium text-neutral-900">Check pages now</p>
              <p className="text-xs leading-5 text-neutral-500">
                Worst SEO score first. Unchanged pages are not sent to the AI again. {data.ai.enabled || data.settings.testMode ? "" : "AI is switched off on this server: only rule-based suggestions."}
              </p>
            </div>
            <div className="w-28">
              <Label htmlFor="assistant-pages" className="text-xs">
                Pages
              </Label>
              <Input id="assistant-pages" type="number" min={1} max={60} value={pages || data.settings.maxPages} onChange={(e) => setPages(Number(e.target.value))} />
            </div>
            <Button disabled={busy || !data.pack} onClick={() => post({ action: "run", maxPages: pages || data.settings.maxPages })}>
              <Play /> {busy ? "Working…" : "Run assistant"}
            </Button>
          </CardContent>
        </Card>
      )}
      {(notice || error) && <p className={`text-sm ${error ? "text-red-700" : "text-emerald-700"}`}>{error || notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "history", "report"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            className={chip(tab === t)}
            onClick={() => {
              setTab(t);
              if (t === "report") void loadReport(reportMonth);
            }}
          >
            {t === "pending" ? `Waiting (${pending.length})` : t === "history" ? "History" : "Monthly report"}
          </button>
        ))}
      </div>

      {tab !== "report" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={chip(!type)} onClick={() => setType("")}>
              All types
            </button>
            {types.map((t) => (
              <button key={t} type="button" className={chip(type === t)} onClick={() => setType(t)}>
                {SUGGESTION_TYPES[t].label}
              </button>
            ))}
            {langs.length > 1 && (
              <>
                <span className="mx-1" />
                <button type="button" className={chip(!lang)} onClick={() => setLang("")}>
                  All languages
                </button>
                {langs.map((l) => (
                  <button key={l} type="button" className={chip(lang === l)} onClick={() => setLang(l)}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </>
            )}
          </div>
          {tab === "pending" && canDecide && pending.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
              <label className="flex items-center gap-2">
                <Switch checked={doPublish} onCheckedChange={(v) => setPublish(v)} />
                Publish right after approving
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !bulk.length}
                onClick={() => post({ action: "approve", ids: bulk.map((s) => s.id), publish: doPublish }, `${bulk.length} low-risk suggestions approved.`)}
              >
                <Check /> Approve all low-risk ({bulk.length})
              </Button>
              <span className="text-xs text-neutral-500">Low-risk = alt texts and meta texts without warnings.</span>
            </div>
          )}
          <div className="space-y-3">
            {shown.length ? (
              shown.map((s) => (
                <SuggestionCard
                  key={s.id + s.status + (s.revisions?.length ?? 0)}
                  s={s}
                  busy={busy}
                  canDecide={canDecide && !(data.role === "client" && s.structural)}
                  onDecide={(action, edits) =>
                    post(
                      { action, ids: [s.id], publish: doPublish, ...(edits && Object.keys(edits).length ? { edits: { [s.id]: edits } } : {}) },
                      action === "approve" ? (doPublish ? "Approved and published." : "Approved: saved to the draft.") : action === "undo" ? "Previous value restored." : "Rejected.",
                    )
                  }
                  onRevise={(change, instruction) => post({ action: "revise", id: s.id, change, instruction }, "Revised: check the new text.")}
                />
              ))
            ) : (
              <p className="rounded-xl bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                {tab === "pending" ? "No suggestions waiting." : "Nothing decided yet."}
              </p>
            )}
          </div>
          {tab === "history" && data.runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Runs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-neutral-600">
                {data.runs.map((r) => (
                  <p key={r.id}>
                    {when(r.at)} · {r.trigger} by {r.by} · {r.pages} pages ({r.aiPages} AI, {r.cachedPages} unchanged) · {r.calls} calls · {usd(r.cost)}
                    {r.aiPages ? ` (${usd(r.cost / r.aiPages)} per page)` : ""} · {r.tokensIn + r.tokensOut} tokens · {r.suggestions} suggestions{r.mock ? " · test mode" : ""}
                    {r.stopped ? ` · ${r.stopped}` : ""}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === "report" && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Monthly report {report?.month}</CardTitle>
            <div className="flex items-center gap-2">
              <Input type="month" value={reportMonth || data.month.id} onChange={(e) => {
                  setReportMonth(e.target.value);
                  void loadReport(e.target.value);
                }} className="h-8 w-40" />
              {data.canSettings && (
                <Button size="sm" variant="outline" disabled={busy || !report} onClick={() => post({ action: "send-report", month: report?.month }, "Report sent through the weekly-report channels that are switched on.")}>
                  Send now
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {!report ? (
              <p className="text-neutral-500">Loading…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ["SEO score", `${report.scoreBefore ?? "—"} → ${report.scoreAfter}`],
                    ["Approved changes", String(report.changes.length)],
                    ["Waiting", String(report.pending)],
                    ["AI cost", `${usd(report.cost)} (${report.calls} calls)`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-neutral-50 p-3">
                      <p className="text-xs text-neutral-500">{k}</p>
                      <p className="text-lg font-semibold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-2 font-medium">What changed</p>
                  {report.changes.length ? (
                    <ul className="space-y-1 text-neutral-600">
                      {report.changes.map((c, n) => (
                        <li key={n}>
                          {c.pageTitle} ({c.locale.toUpperCase()}), {c.label}: <span className="text-neutral-900">{c.after}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-neutral-500">No changes approved in this month.</p>
                  )}
                </div>
                {report.pages.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium">Changed pages: last 30 days vs the 30 before</p>
                    <ul className="space-y-1 text-neutral-600">
                      {report.pages.map((p) => (
                        <li key={p.pageId}>
                          {p.title}: {p.views} views (before {p.prevViews}), {p.visitors} visitors (before {p.prevVisitors})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-2 font-medium">Next</p>
                  <ul className="space-y-1 text-neutral-600">
                    {report.next.map((n, i) => (
                      <li key={i}>
                        {n.pageTitle}: {n.label} — {n.reason}
                      </li>
                    ))}
                  </ul>
                </div>
                {data.reports[report.month]?.sentAt && (
                  <p className="text-xs text-neutral-500">
                    Sent {when(data.reports[report.month].sentAt)}: {data.reports[report.month].result}
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  Sent automatically each month (with the monthly run) through Analytics → Weekly report channels (e-mail / Telegram) when they are switched on.
                  {scoreBefore === undefined ? "" : ` Score at the first run this month: ${scoreBefore}.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {data.canSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Assistant settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-2">
            {(
              [
                ["monthly", "Monthly run", "On the 1st of each month: check pages and send last month's report (cron /api/cron/seo-assistant)."],
                ["testMode", "Test mode", "Canned answers instead of AI: no cost. Suggestions are marked as test text."],
                ["publish", "Publish after approving (default)", "Otherwise approved changes go to the page draft."],
                ["report", "Send monthly report", "Through Analytics → Weekly report channels (e-mail / Telegram)."],
              ] as const
            ).map(([key, label, text]) => (
              <label key={key} className="flex items-start justify-between gap-4 rounded-lg bg-neutral-50 p-3">
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs leading-5 text-neutral-500">{text}</span>
                </span>
                <Switch checked={data.settings[key]} disabled={busy} onCheckedChange={(v) => post({ action: "settings", [key]: v }, "Saved.")} />
              </label>
            ))}
            <form
              className="flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3 md:col-span-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void post({ action: "settings", budgetUsd: Number(form.get("budget")), maxPages: Number(form.get("max")) }, "Saved.");
              }}
            >
              <div className="w-36">
                <Label htmlFor="assistant-budget" className="text-xs">
                  Monthly AI budget, USD
                </Label>
                <Input id="assistant-budget" name="budget" type="number" step="0.05" min={0} max={20} defaultValue={data.settings.budgetUsd} />
              </div>
              <div className="w-36">
                <Label htmlFor="assistant-max" className="text-xs">
                  Pages per run
                </Label>
                <Input id="assistant-max" name="max" type="number" min={1} max={60} defaultValue={data.settings.maxPages} />
              </div>
              <Button size="sm" type="submit" variant="outline" disabled={busy}>
                Save
              </Button>
              <p className="w-full text-xs text-neutral-500">The installation-wide cap (CMS_AI_MONTHLY_USD) still applies on top of this.</p>
            </form>
          </CardContent>
        </Card>
      )}
    </AdminPanel>
  );
}
