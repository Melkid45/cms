"use client";
import { Select, SelectOption } from "@/components/ui/select";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/admin/admin-panel";
import { money, overdue, type CrmData, type Deal, type Stage } from "@/lib/builder/crm/shared";
import { cn } from "@/lib/utils";
import { CrmTabs, ErrorLine, card } from "./crm-ui";
import { DealForm } from "./deal-form";
import { formatDate, personName, useCrm } from "./use-crm";

const stageTone: Record<Stage["kind"], string> = {
  open: "bg-neutral-100",
  won: "bg-emerald-50",
  lost: "bg-neutral-100/60",
};

// Kanban of the website's deals. Drag a card to another column (or between cards);
// clicking a card opens it, where the stage can also be changed without dragging.
export function Pipeline() {
  const { data, error, busy, act } = useCrm();
  const [editing, setEditing] = useState<Deal | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Deal | null>(null);
  const [owner, setOwner] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const columns = useMemo(() => {
    if (!data) return [];
    return data.stages.map((stage) => {
      const deals = data.deals
        .filter((d) => d.stageId === stage.id && (!owner || d.ownerId === owner))
        .sort((a, b) => a.position - b.position || b.createdAt.localeCompare(a.createdAt));
      return { stage, deals, total: deals.reduce((s, d) => s + d.value, 0) };
    });
  }, [data, owner]);
  const openValue = columns.filter((c) => c.stage.kind === "open").reduce((s, c) => s + c.total, 0);
  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    if (!data || !event.over) return;
    const deal = data.deals.find((d) => d.id === event.active.id);
    const target = String(event.over.id);
    if (!deal) return;
    let stageId = "",
      beforeId: string | undefined;
    if (target.startsWith("col:")) stageId = target.slice(4);
    else {
      const other = data.deals.find((d) => d.id === target.slice(5));
      if (!other || other.id === deal.id) return;
      stageId = other.stageId;
      beforeId = other.id;
    }
    if (stageId === deal.stageId && !beforeId) return;
    await act({ action: "deal.move", id: deal.id, revision: deal.revision, stageId, ...(beforeId ? { beforeId } : {}) });
  }
  return (
    <AdminPanel
      title="Deals"
      className="min-w-0"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <span className="text-sm text-neutral-500">
                Open deals: {money(openValue, data.settings.currency)}
              </span>
            )}
            {data && data.team.length > 1 && (
              <Select aria-label="Owner" className="h-9 " value={String(owner)} onValueChange={(selectedValue) => setOwner(selectedValue)}>
                <SelectOption value="">Everyone</SelectOption>
                {data.team.map((m) => (
                  <SelectOption key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectOption>
                ))}
              </Select>
            )}
            <Button disabled={!data?.contacts.length} onClick={() => setAdding("")}>
              <Plus /> New deal
            </Button>
          </div>
        }</div>}
    >
      <CrmTabs overdue={data?.tasks.filter((t) => overdue(t)).length ?? 0} />
      <ErrorLine error={error} />
      {!data && !error && <p className="text-sm text-neutral-500">Loading deals…</p>}
      {data && !data.contacts.length && (
        <p className={`${card} mb-4 p-4 text-sm text-neutral-600`}>
          A deal belongs to a contact. Add a contact first, or wait for the first enquiry. <Link href="/dashboard/crm" className="underline">Contacts</Link>
        </p>
      )}
      {data && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => setDragging(data.deals.find((d) => d.id === e.active.id) || null)}
          onDragCancel={() => setDragging(null)}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <div className="flex gap-3" style={{ minWidth: `${columns.length * 212}px` }}>
              {columns.map(({ stage, deals, total }) => (
                <Column key={stage.id} stage={stage} count={deals.length} total={money(total, data.settings.currency)} onAdd={() => setAdding(stage.id)}>
                  {deals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} data={data} onOpen={() => setEditing(deal)} busy={busy} />
                  ))}
                </Column>
              ))}
            </div>
          </div>
          <DragOverlay>{dragging && <DealBody deal={dragging} data={data} lifted />}</DragOverlay>
        </DndContext>
      )}
      {data && adding !== null && (
        <DealForm data={data} stageId={adding || undefined} busy={busy} onClose={() => setAdding(null)} onSave={async (deal) => !!(await act({ action: "deal.create", deal }))} />
      )}
      {data && editing && (
        <DealForm
          data={data}
          deal={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (deal) => !!(await act({ action: "deal.update", id: editing.id, revision: editing.revision, deal }))}
          onDelete={async () => !!(await act({ action: "deal.delete", id: editing.id }))}
        />
      )}
    </AdminPanel>
  );
}

function Column({ stage, count, total, onAdd, children }: { stage: Stage; count: number; total: string; onAdd: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage.id}` });
  return (
    <section ref={setNodeRef} className={cn("flex min-h-[320px] min-w-[200px] flex-1 basis-0 flex-col rounded-xl p-2 transition-shadow", stageTone[stage.kind], isOver && "shadow-[inset_0_0_0_2px_rgb(0_0_0/0.5)]")}>
      <header className="flex items-center gap-2 px-2 pb-2 pt-1">
        <h2 className="flex-1 truncate text-sm font-semibold">{stage.name}</h2>
        <span className="text-xs text-neutral-500">{count}</span>
        <button type="button" aria-label={`Add a deal to ${stage.name}`} onClick={onAdd} className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-white hover:text-black">
          <Plus className="size-4" />
        </button>
      </header>
      <p className="px-2 pb-2 text-xs text-neutral-500">{total}</p>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

function DealCard({ deal, data, onOpen, busy }: { deal: Deal; data: CrmData; onOpen: () => void; busy: boolean }) {
  const drag = useDraggable({ id: deal.id, disabled: busy });
  const drop = useDroppable({ id: `card:${deal.id}` });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        drag.listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen();
      }}
      className={cn("cursor-grab touch-manipulation rounded-lg outline-none focus-visible:shadow-[0_0_0_2px_black]", drag.isDragging && "opacity-30", drop.isOver && !drag.isDragging && "shadow-[0_-3px_0_black]")}
    >
      <DealBody deal={deal} data={data} />
    </div>
  );
}
function DealBody({ deal, data, lifted }: { deal: Deal; data: CrmData; lifted?: boolean }) {
  const contact = data.contacts.find((c) => c.id === deal.contactId);
  const late = deal.expectedDate && data.stages.find((s) => s.id === deal.stageId)?.kind === "open" && deal.expectedDate < new Date().toISOString().slice(0, 10);
  return (
    <div className={cn("rounded-lg bg-white p-3 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-colors hover:bg-neutral-50", lifted && "shadow-[0_10px_30px_rgb(0_0_0/0.15)]")}>
      <p className="font-medium leading-5">
        {deal.title}
        {deal.test && <span className="ml-1 text-[10px] font-normal text-amber-700">TEST</span>}
      </p>
      <p className="mt-1 truncate text-xs text-neutral-500">{contact ? contact.name || contact.email || contact.phone : "No contact"}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{money(deal.value, deal.currency)}</span>
        <span className={cn("truncate", late ? "text-red-600" : "text-neutral-400")}>
          {deal.expectedDate ? formatDate(deal.expectedDate, "UTC") : deal.ownerId ? personName(data, deal.ownerId) : ""}
        </span>
      </div>
    </div>
  );
}
