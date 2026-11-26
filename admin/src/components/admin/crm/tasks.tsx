"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/admin/admin-panel";
import { overdue, type Task } from "@/lib/builder/crm/shared";
import { cn } from "@/lib/utils";
import { CrmTabs, ErrorLine, card } from "./crm-ui";
import { TaskForm } from "./task-form";
import { formatDate, personName, useCrm } from "./use-crm";

const VIEWS = [
  { id: "mine", label: "My tasks" },
  { id: "open", label: "All open" },
  { id: "overdue", label: "Overdue" },
  { id: "done", label: "Done" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export function Tasks() {
  const { data, error, busy, act } = useCrm();
  const [view, setView] = useState<View>("mine");
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const tasks = data?.tasks ?? [];
  const pick = (v: View) =>
    tasks.filter((t) =>
      v === "mine" ? !t.done && t.assigneeId === data?.me : v === "open" ? !t.done : v === "overdue" ? overdue(t) : t.done,
    );
  const shown = pick(view).sort((a, b) =>
    view === "done" ? (b.doneAt || "").localeCompare(a.doneAt || "") : (a.due || "9999").localeCompare(b.due || "9999"),
  );
  const zone = data?.timeZone || "UTC";
  return (
    <AdminPanel
      title="Tasks"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <Button disabled={!data} onClick={() => setAdding(true)}>
            <Plus /> New task
          </Button>
        }</div>}
    >
      <CrmTabs overdue={pick("overdue").length} />
      <ErrorLine error={error} />
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Button key={v.id} variant={view === v.id ? "secondary" : "ghost"} onClick={() => setView(v.id)}>
            {v.label} ({pick(v.id).length})
          </Button>
        ))}
      </div>
      {!data && !error && <p className="text-sm text-neutral-500">Loading tasks…</p>}
      {data && (
        <div className={`${card} overflow-hidden`}>
          {shown.map((t) => {
            const contact = data.contacts.find((c) => c.id === t.contactId);
            const deal = data.deals.find((d) => d.id === t.dealId);
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 [&+&]:shadow-[0_-1px_0_rgb(0_0_0/0.04)]">
                <button
                  type="button"
                  aria-label={t.done ? `Mark “${t.title}” as not done` : `Mark “${t.title}” as done`}
                  disabled={busy}
                  onClick={() => void act({ action: "task.update", id: t.id, revision: t.revision, task: { done: !t.done } })}
                  className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md transition-colors", t.done ? "bg-black text-white" : "bg-neutral-200 hover:bg-neutral-300")}
                >
                  {t.done && <Check className="size-3.5" />}
                </button>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                  <span className={cn("block text-sm", t.done && "text-neutral-400 line-through")}>
                    {t.title}
                    {t.test && <span className="ml-2 text-[11px] text-amber-700">TEST</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    <span className={cn(overdue(t) && "font-medium text-red-600")}>
                      {t.due ? formatDate(t.due, zone, true) : "No due date"}
                      {overdue(t) && " · overdue"}
                    </span>
                    {" · "}
                    {personName(data, t.assigneeId)}
                    {deal && ` · ${deal.title}`}
                  </span>
                </button>
                {contact && (
                  <Link href={`/dashboard/crm/${contact.id}`} className="hidden max-w-[40%] truncate text-xs text-neutral-500 hover:text-black sm:block">
                    {contact.name || contact.email || contact.phone}
                  </Link>
                )}
              </div>
            );
          })}
          {!shown.length && <p className="p-10 text-center text-sm text-neutral-500">{view === "mine" ? "Nothing on your list." : "No tasks here."}</p>}
        </div>
      )}
      {data && adding && <TaskForm data={data} busy={busy} onClose={() => setAdding(false)} onSave={async (task) => !!(await act({ action: "task.create", task }))} />}
      {data && editing && (
        <TaskForm
          data={data}
          task={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (task) => !!(await act({ action: "task.update", id: editing.id, revision: editing.revision, task }))}
          onDelete={async () => !!(await act({ action: "task.delete", id: editing.id }))}
        />
      )}
    </AdminPanel>
  );
}
