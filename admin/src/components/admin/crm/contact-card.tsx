"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Mail, Merge, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  SOURCE_LABELS,
  money,
  overdue,
  type ContactDetail,
} from "@/lib/builder/crm/shared";
import { CrmTabs, ErrorLine, StatusPill, Tag, card } from "./crm-ui";
import { ContactForm } from "./contact-form";
import { DealForm } from "./deal-form";
import { TaskForm } from "./task-form";
import { CRM_CHANGED, crmRequest, formatDate, personName, useCrm } from "./use-crm";
import { cn } from "@/lib/utils";

const kindTone: Record<string, string> = {
  enquiry: "bg-sky-500",
  order: "bg-emerald-500",
  deal: "bg-violet-500",
  task: "bg-amber-500",
  event: "bg-neutral-300",
};

export function ContactCard({ id }: { id: string }) {
  const router = useRouter();
  const crm = useCrm();
  const { data, busy, act } = crm;
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [dealOpen, setDealOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      setDetail(await crmRequest<ContactDetail>(`/api/builder/crm/contact?id=${encodeURIComponent(id)}`));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the contact.");
    }
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const reload = () => void load();
    window.addEventListener(CRM_CHANGED, reload);
    return () => window.removeEventListener(CRM_CHANGED, reload);
  }, [load]);
  const c = detail?.contact;
  const zone = data?.timeZone || "UTC";
  const deals = data?.deals.filter((d) => d.contactId === id) ?? [];
  const tasks = data?.tasks.filter((t) => t.contactId === id) ?? [];
  const stage = (sid: string) => data?.stages.find((s) => s.id === sid);
  return (
    <div className="rise-in">
      <Link href="/dashboard/crm" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black">
        <ArrowLeft className="size-4" /> Contacts
      </Link>
      <CrmTabs overdue={data?.tasks.filter((t) => overdue(t)).length ?? 0} />
      <ErrorLine error={loadError || crm.error} />
      {!c && !loadError && <p className="text-sm text-neutral-500">Loading…</p>}
      {c && (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-5">
            <section className={`${card} p-5`}>
              <div className="mb-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="break-words text-xl font-semibold tracking-[-0.02em]">
                    {c.name || c.email || c.phone || "No name"}
                    {c.test && <span className="ml-2 align-middle text-xs font-normal text-amber-700">TEST</span>}
                  </h1>
                  {c.company && <p className="text-sm text-neutral-500">{c.company}</p>}
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Edit contact" onClick={() => setEditing(true)}>
                  <Pencil />
                </Button>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <StatusPill status={c.status} />
                {c.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              <dl className="space-y-2.5 text-sm">
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-neutral-400" />
                    <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className="hover:underline">{c.phone}</a>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-neutral-400" />
                    <a href={`mailto:${c.email}`} className="break-all hover:underline">{c.email}</a>
                  </div>
                )}
                <Fact label="Language" value={c.language ? c.language.toUpperCase() : "—"} />
                <Fact label="Source" value={`${SOURCE_LABELS[c.source.kind]}${c.source.page ? ` · ${c.source.page}` : ""}`} />
                {c.source.utm && (
                  <Fact label="Campaign (UTM)" value={[c.source.utm.source, c.source.utm.medium, c.source.utm.campaign].filter(Boolean).join(" / ")} />
                )}
                <Fact label="Enquiries" value={String(c.enquiries)} />
                <Fact label="Orders" value={c.orders ? `${c.orders} · ${money(c.revenue, c.currency)}` : "0"} />
                {c.customerAccount && <Fact label="Shop account" value="Has a customer account on the website" />}
                <Fact label="Added" value={formatDate(c.createdAt, zone)} />
              </dl>
            </section>

            <section className={`${card} p-5`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Deals</h2>
                <Button size="sm" variant="ghost" onClick={() => setDealOpen(true)}>
                  <Plus /> Deal
                </Button>
              </div>
              {!deals.length && <p className="text-xs text-neutral-500">No deals yet.</p>}
              <div className="space-y-2">
                {deals.map((d) => (
                  <Link key={d.id} href="/dashboard/crm/pipeline" className="block rounded-lg bg-neutral-50 p-3 text-sm hover:bg-neutral-100">
                    <span className="block font-medium">{d.title}</span>
                    <span className="text-xs text-neutral-500">
                      {stage(d.stageId)?.name} · {money(d.value, d.currency)}
                      {d.expectedDate && ` · ${formatDate(d.expectedDate, zone)}`}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className={`${card} p-5`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Tasks</h2>
                <Button size="sm" variant="ghost" onClick={() => setTaskOpen(true)}>
                  <Plus /> Task
                </Button>
              </div>
              {!tasks.length && <p className="text-xs text-neutral-500">No tasks.</p>}
              <div className="space-y-1">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-neutral-50">
                    <button
                      type="button"
                      aria-label={t.done ? "Mark as not done" : "Mark as done"}
                      onClick={() => void act({ action: "task.update", id: t.id, revision: t.revision, task: { done: !t.done } })}
                      className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded", t.done ? "bg-black text-white" : "bg-neutral-200")}
                    >
                      {t.done && <Check className="size-3" />}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block", t.done && "text-neutral-400 line-through")}>{t.title}</span>
                      <span className={cn("text-xs", overdue(t) ? "text-red-600" : "text-neutral-500")}>
                        {t.due ? formatDate(t.due, zone, true) : "No due date"} · {personName(data, t.assigneeId)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {detail.duplicates.length > 0 && (
              <section className={`${card} p-5`}>
                <h2 className="mb-1 text-sm font-semibold">Possible duplicates</h2>
                <p className="mb-3 text-xs text-neutral-500">Merging keeps all enquiries, orders, deals, tasks and notes on this contact.</p>
                <div className="space-y-2">
                  {detail.duplicates.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-lg bg-neutral-50 p-2.5 text-sm">
                      <Link href={`/dashboard/crm/${d.id}`} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate">{d.name || d.email || d.phone}</span>
                        <span className="block truncate text-xs text-neutral-500">{d.reason}</span>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Merge “${d.name || d.email || d.phone}” into this contact?`))
                            void act({ action: "contact.merge", id: c.id, revision: c.revision, sourceIds: [d.id] });
                        }}
                      >
                        <Merge /> Merge
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <Button
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={async () => {
                if (!confirm("Delete this contact and its deals? Enquiries and orders stay in Inbox and Shop orders.")) return;
                if (await act({ action: "contact.delete", ids: [c.id] })) router.push("/dashboard/crm");
              }}
            >
              <Trash2 /> Delete contact
            </Button>
          </div>

          <section className={`${card} p-5`}>
            <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
            <form
              className="mb-6 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (note.trim() && (await act({ action: "contact.note", id: c.id, text: note.trim() }))) setNote("");
              }}
            >
              <Textarea aria-label="Note" rows={2} maxLength={4000} placeholder="Add a note: a call, an agreement, what to remember" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" type="submit" disabled={busy || !note.trim()}>
                Add note
              </Button>
            </form>
            <ol className="space-y-4">
              {detail.timeline.map((item, i) => (
                <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3">
                  <span className={cn("mt-1.5 size-2.5 rounded-full", kindTone[item.kind])} />
                  <div className="min-w-0">
                    <p className="text-sm">
                      {item.href ? (
                        <Link href={item.href} className="font-medium hover:underline">
                          {item.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.title}</span>
                      )}
                    </p>
                    {item.text && <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-2.5 text-xs leading-5 text-neutral-700">{item.text}</p>}
                    <p className="mt-1 text-[11px] text-neutral-400">
                      {formatDate(item.at, zone, true)}
                      {item.by && ` · ${item.by}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {editing && c && (
        <ContactForm
          contact={c}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={async (contact) => !!(await act({ action: "contact.update", id: c.id, revision: c.revision, contact }))}
        />
      )}
      {dealOpen && data && c && (
        <DealForm data={data} contactId={c.id} busy={busy} onClose={() => setDealOpen(false)} onSave={async (deal) => !!(await act({ action: "deal.create", deal }))} />
      )}
      {taskOpen && data && c && (
        <TaskForm data={data} contactId={c.id} busy={busy} onClose={() => setTaskOpen(false)} onSave={async (task) => !!(await act({ action: "task.create", task }))} />
      )}
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs leading-5 text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
