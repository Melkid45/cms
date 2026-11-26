"use client";
import { Select, SelectOption } from "@/components/ui/select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CrmData, Deal } from "@/lib/builder/crm/shared";
import { Dialog, field, label } from "./crm-ui";

export interface DealInput {
  title: string;
  contactId: string;
  stageId: string;
  value: number;
  currency: string;
  expectedDate: string;
  ownerId: string;
}
// New deal or edit. A deal always belongs to a contact.
export function DealForm({
  data,
  deal,
  contactId,
  stageId,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  data: CrmData;
  deal?: Deal;
  contactId?: string;
  stageId?: string;
  busy: boolean;
  onSave: (input: DealInput) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    title: deal?.title || "",
    contactId: deal?.contactId || contactId || "",
    stageId: deal?.stageId || stageId || data.stages.find((s) => s.kind === "open")?.id || data.stages[0].id,
    value: String(deal?.value ?? ""),
    currency: deal?.currency || data.settings.currency,
    expectedDate: deal?.expectedDate || "",
    ownerId: deal?.ownerId ?? data.me,
  });
  const set = (key: keyof typeof value) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValue((v) => ({ ...v, [key]: e.target.value }));
  const contacts = [...data.contacts].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  return (
    <Dialog title={deal ? "Edit deal" : "New deal"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onSave({ ...value, value: Number(value.value.replace(",", ".")) || 0 });
          if (ok) onClose();
        }}
      >
        <div className="sm:col-span-2">
          <label className={label} htmlFor="deal-title">What is the deal</label>
          <input id="deal-title" className={field} value={value.title} onChange={set("title")} maxLength={200} required autoFocus placeholder="Kitchen, 3.2 m, oak" />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="deal-contact">Contact</label>
          <Select id="deal-contact" className="h-9 " value={String(value.contactId)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["contactId"]: selectedValue }))} required disabled={!!contactId && !deal}>
            <SelectOption value="">Choose a contact</SelectOption>
            {contacts.map((c) => (
              <SelectOption key={c.id} value={String(c.id)}>
                {c.name || c.email || c.phone}
                {c.company ? ` · ${c.company}` : ""}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div>
          <label className={label} htmlFor="deal-stage">Stage</label>
          <Select id="deal-stage" className="h-9 " value={String(value.stageId)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["stageId"]: selectedValue }))}>
            {data.stages.map((s) => (
              <SelectOption key={s.id} value={String(s.id)}>
                {s.name}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div>
          <label className={label} htmlFor="deal-owner">Owner</label>
          <Select id="deal-owner" className="h-9 " value={String(value.ownerId)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["ownerId"]: selectedValue }))}>
            <SelectOption value="">Nobody</SelectOption>
            {data.team.map((m) => (
              <SelectOption key={m.id} value={String(m.id)}>
                {m.name}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div>
            <label className={label} htmlFor="deal-value">Value</label>
            <input id="deal-value" inputMode="decimal" className={field} value={value.value} onChange={set("value")} placeholder="0" />
          </div>
          <div>
            <label className={label} htmlFor="deal-currency">Currency</label>
            <input id="deal-currency" className={field} value={value.currency} onChange={set("currency")} maxLength={8} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="deal-date">Expected close</label>
          <input id="deal-date" type="date" className={field} value={value.expectedDate} onChange={set("expectedDate")} />
        </div>
        <div className="mt-2 flex items-center gap-2 sm:col-span-2">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (confirm("Delete this deal?") && (await onDelete())) onClose();
              }}
            >
              Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !value.title.trim() || !value.contactId}>
            {deal ? "Save" : "Add deal"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
