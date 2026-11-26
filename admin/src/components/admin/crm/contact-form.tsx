"use client";
import { Select, SelectOption } from "@/components/ui/select";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CONTACT_STATUSES, STATUS_LABELS, type ContactRow, type ContactStatus } from "@/lib/builder/crm/shared";
import { Dialog, field, label } from "./crm-ui";

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  language: string;
  status: ContactStatus;
  tags: string[];
}
const LANGUAGES = ["", "lv", "ru", "en", "de", "lt", "et"];
// Add or edit a contact. Tags: comma separated.
export function ContactForm({
  contact,
  busy,
  onSave,
  onClose,
}: {
  contact?: ContactRow;
  busy: boolean;
  onSave: (input: ContactInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    name: contact?.name || "",
    email: contact?.email || "",
    phone: contact?.phone || "",
    company: contact?.company || "",
    language: contact?.language || "",
    status: contact?.status || ("lead" as ContactStatus),
    tags: (contact?.tags || []).join(", "),
  });
  const set = (key: keyof typeof value) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValue((v) => ({ ...v, [key]: e.target.value }));
  return (
    <Dialog title={contact ? "Edit contact" : "New contact"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onSave({
            ...value,
            tags: value.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          });
          if (ok) onClose();
        }}
      >
        <div className="sm:col-span-2">
          <label className={label} htmlFor="crm-name">Name</label>
          <input id="crm-name" className={field} value={value.name} onChange={set("name")} maxLength={200} autoFocus />
        </div>
        <div>
          <label className={label} htmlFor="crm-email">E-mail</label>
          <input id="crm-email" type="email" className={field} value={value.email} onChange={set("email")} maxLength={200} />
        </div>
        <div>
          <label className={label} htmlFor="crm-phone">Phone</label>
          <input id="crm-phone" type="tel" className={field} value={value.phone} onChange={set("phone")} maxLength={40} />
        </div>
        <div>
          <label className={label} htmlFor="crm-company">Company</label>
          <input id="crm-company" className={field} value={value.company} onChange={set("company")} maxLength={200} />
        </div>
        <div>
          <label className={label} htmlFor="crm-language">Language</label>
          <Select id="crm-language" className="h-9 " value={String(value.language)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["language"]: selectedValue }))}>
            {[...new Set([...LANGUAGES, value.language])].map((l) => (
              <SelectOption key={l} value={String(l)}>
                {l ? l.toUpperCase() : "—"}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div>
          <label className={label} htmlFor="crm-status">Status</label>
          <Select id="crm-status" className="h-9 " value={String(value.status)} onValueChange={(selectedValue) => setValue(current => ({ ...current, ["status"]: CONTACT_STATUSES.find(status => status === selectedValue) || current.status }))}>
            {CONTACT_STATUSES.map((s) => (
              <SelectOption key={s} value={String(s)}>
                {STATUS_LABELS[s]}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div>
          <label className={label} htmlFor="crm-tags">Tags (comma separated)</label>
          <input id="crm-tags" className={field} value={value.tags} onChange={set("tags")} maxLength={400} placeholder="vip, wholesale" />
        </div>
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || (!value.name.trim() && !value.email.trim() && !value.phone.trim())}>
            {contact ? "Save" : "Add contact"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
