"use client";
import { Select, SelectOption } from "@/components/ui/select";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Download, Merge, Plus, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/admin/admin-panel";
import { withSite } from "@/lib/builder/site-client";
import { useWorkspace } from "@/components/admin/site-context";
import {
  CONTACT_STATUSES,
  SOURCE_KINDS,
  SOURCE_LABELS,
  STATUS_LABELS,
  money,
  overdue,
  type ContactRow,
} from "@/lib/builder/crm/shared";
import { CrmTabs, Dialog, ErrorLine, StatusPill, Tag, card, field } from "./crm-ui";
import { ContactForm } from "./contact-form";
import { formatDate, useCrm } from "./use-crm";

// Minimal CSV reader: quotes, doubled quotes, comma or semicolon (picked from the header).
function parseCsv(text: string) {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}
const COLUMN_NAMES: Record<string, string[]> = {
  name: ["name", "full name", "contact", "имя", "vārds"],
  email: ["email", "e-mail", "mail", "почта", "e-pasts"],
  phone: ["phone", "tel", "telephone", "mobile", "телефон", "tālrunis"],
  company: ["company", "organisation", "organization", "компания", "uzņēmums"],
  language: ["language", "lang", "язык", "valoda"],
  status: ["status", "статус"],
  tags: ["tags", "tag", "теги"],
  note: ["note", "notes", "comment", "заметка"],
};
function csvToRows(text: string) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const index: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = Object.entries(COLUMN_NAMES).find(([, names]) => names.includes(h.trim().toLowerCase()))?.[0];
    if (key && index[key] === undefined) index[key] = i;
  });
  return body.map((cells) =>
    Object.fromEntries(
      Object.keys(COLUMN_NAMES).map((key) => [
        key,
        index[key] === undefined ? "" : (cells[index[key]] || "").replace(/^'(?=[=+\-@])/, "").trim().slice(0, key === "note" ? 2000 : key === "tags" ? 400 : 200),
      ]),
    ),
  );
}

export function Contacts() {
  const workspace = useWorkspace();
  const { data, error, busy, act } = useCrm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [orders, setOrders] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState<Record<string, string>[] | null>(null);
  const [importResult, setImportResult] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const tags = useMemo(() => [...new Set(contacts.flatMap((c) => c.tags))].sort(), [contacts]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return contacts.filter(
      (c) =>
        (!q ||
          [c.name, c.email, c.company, ...c.tags].some((v) => v.toLowerCase().includes(q)) ||
          (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))) &&
        (!status || c.status === status) &&
        (!tag || c.tags.includes(tag)) &&
        (!source || c.source.kind === source) &&
        (!orders || (orders === "yes" ? c.orders > 0 : c.orders === 0)),
    );
  }, [contacts, query, status, tag, source, orders]);
  const late = data?.tasks.filter((t) => overdue(t)).length ?? 0;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  async function merge() {
    const chosen = contacts.filter((c) => selected.includes(c.id));
    // Keep the oldest contact; the others are merged into it.
    const [target, ...rest] = [...chosen].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!target || !rest.length) return;
    if (!confirm(`Merge ${chosen.length} contacts into “${target.name || target.email || target.phone}”? Enquiries, orders, deals, tasks and notes are kept.`)) return;
    if (await act({ action: "contact.merge", id: target.id, revision: target.revision, sourceIds: rest.map((c) => c.id) })) setSelected([]);
  }
  async function remove() {
    if (!confirm(`Delete ${selected.length} contact(s) with their deals? Enquiries and orders stay in Inbox and Shop orders.`)) return;
    if (await act({ action: "contact.delete", ids: selected })) setSelected([]);
  }
  return (
    <AdminPanel
      title="Contacts"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => file.current?.click()}>
              <Upload /> Import CSV
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href={withSite("/api/builder/crm/export", workspace?.site?.id)} />}>
              <Download /> Export CSV
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add contact
            </Button>
          </div>
        }</div>}
    >
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 1_000_000) return alert("The file is larger than 1 MB.");
          setImportResult("");
          setImporting(csvToRows(await f.text()).slice(0, 2000));
        }}
      />
      <CrmTabs overdue={late} />
      <ErrorLine error={error} />
      <div className={`${card} mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(4,160px)]`}>
        <label className="relative">
          <span className="sr-only">Search contacts</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-neutral-400" />
          <input className={`${field} pl-9`} placeholder="Search name, e-mail, phone, company, tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Select aria-label="Status" className="h-9 " value={String(status)} onValueChange={(selectedValue) => setStatus(selectedValue)}>
          <SelectOption value="">Any status</SelectOption>
          {CONTACT_STATUSES.map((s) => (
            <SelectOption key={s} value={String(s)}>
              {STATUS_LABELS[s]}
            </SelectOption>
          ))}
        </Select>
        <Select aria-label="Tag" className="h-9 " value={String(tag)} onValueChange={(selectedValue) => setTag(selectedValue)}>
          <SelectOption value="">Any tag</SelectOption>
          {tags.map((t) => (
            <SelectOption key={t} value={String(t)}>
              {t}
            </SelectOption>
          ))}
        </Select>
        <Select aria-label="Source" className="h-9 " value={String(source)} onValueChange={(selectedValue) => setSource(selectedValue)}>
          <SelectOption value="">Any source</SelectOption>
          {SOURCE_KINDS.map((s) => (
            <SelectOption key={s} value={String(s)}>
              {SOURCE_LABELS[s]}
            </SelectOption>
          ))}
        </Select>
        <Select aria-label="Orders" className="h-9 " value={String(orders)} onValueChange={(selectedValue) => setOrders(selectedValue)}>
          <SelectOption value="">Orders: any</SelectOption>
          <SelectOption value="yes">Has orders</SelectOption>
          <SelectOption value="no">No orders</SelectOption>
        </Select>
      </div>
      {selected.length > 0 && (
        <div className={`${card} mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm`}>
          <span className="flex-1">{selected.length} selected</span>
          <Button size="sm" variant="outline" disabled={busy || selected.length < 2} onClick={() => void merge()}>
            <Merge /> Merge duplicates
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>
            <Trash2 /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      {!data && !error && <p className="text-sm text-neutral-500">Loading contacts…</p>}
      {data && (
        <div className={`${card} overflow-hidden`}>
          <div className="hidden grid-cols-[32px_minmax(0,1.6fr)_minmax(0,1.4fr)_110px_minmax(0,1fr)_120px_110px] gap-3 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-500 lg:grid">
            <span />
            <span>Name</span>
            <span>Contacts</span>
            <span>Status</span>
            <span>Source</span>
            <span className="text-right">Orders</span>
            <span className="text-right">Last activity</span>
          </div>
          {shown.map((c) => (
            <Row key={c.id} contact={c} checked={selected.includes(c.id)} onToggle={() => toggle(c.id)} timeZone={data.timeZone} />
          ))}
          {!shown.length && (
            <p className="p-10 text-center text-sm text-neutral-500">
              {contacts.length ? "No contacts match these filters." : "Contacts appear here with the first enquiry or order. You can also add or import them."}
            </p>
          )}
        </div>
      )}
      {data && (
        <p className="mt-3 text-xs text-neutral-400">
          {shown.length} of {contacts.length} contacts
        </p>
      )}
      {adding && (
        <ContactForm
          busy={busy}
          onClose={() => setAdding(false)}
          onSave={async (contact) => !!(await act({ action: "contact.create", contact }))}
        />
      )}
      {importing && (
        <Dialog title="Import contacts" onClose={() => setImporting(null)}>
          {importResult ? (
            <p className="text-sm">{importResult}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-600">
                {importing.length} rows found. Columns used: name, email, phone, company, language, status, tags, note. Rows with the e-mail or phone of an
                existing contact update that contact (empty fields only, tags are added).
              </p>
              <div className="mb-4 max-h-48 overflow-auto rounded-lg bg-neutral-50 p-2 text-xs">
                {importing.slice(0, 8).map((r, i) => (
                  <div key={i} className="truncate py-0.5">
                    {[r.name, r.email, r.phone, r.company].filter(Boolean).join(" · ") || "(empty row)"}
                  </div>
                ))}
                {importing.length > 8 && <div className="py-0.5 text-neutral-400">… {importing.length - 8} more</div>}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImporting(null)}>
              {importResult ? "Close" : "Cancel"}
            </Button>
            {!importResult && (
              <Button
                disabled={busy || !importing.length}
                onClick={async () => {
                  const r = await act<{ created: number; updated: number; skipped: number }>({ action: "contact.import", rows: importing });
                  if (r) setImportResult(`Added ${r.created}, updated ${r.updated}, skipped ${r.skipped} (no name, e-mail or phone).`);
                }}
              >
                Import {importing.length}
              </Button>
            )}
          </div>
        </Dialog>
      )}
    </AdminPanel>
  );
}

function Row({ contact: c, checked, onToggle, timeZone }: { contact: ContactRow; checked: boolean; onToggle: () => void; timeZone: string }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-neutral-50 lg:grid-cols-[32px_minmax(0,1.6fr)_minmax(0,1.4fr)_110px_minmax(0,1fr)_120px_110px] lg:items-center [&+&]:shadow-[0_-1px_0_rgb(0_0_0/0.04)]">
      <input type="checkbox" aria-label={`Select ${c.name || c.email}`} checked={checked} onChange={onToggle} className="mt-1 size-4 accent-black lg:mt-0" />
      <div className="min-w-0">
        <Link href={`/dashboard/crm/${c.id}`} className="block truncate text-sm font-medium hover:underline">
          {c.name || c.email || c.phone || "No name"}
          {c.test && <span className="ml-2 text-[11px] font-normal text-amber-700">TEST</span>}
        </Link>
        <span className="block truncate text-xs text-neutral-500">
          {c.company}
          {c.company && c.tags.length > 0 && " · "}
          {c.tags.slice(0, 3).map((t) => (
            <span key={t} className="mr-1">
              <Tag>{t}</Tag>
            </span>
          ))}
        </span>
      </div>
      <div className="col-start-2 min-w-0 text-xs text-neutral-600 lg:col-start-auto">
        {c.email && <span className="block truncate">{c.email}</span>}
        {c.phone && <span className="block truncate">{c.phone}</span>}
      </div>
      <div className="col-start-2 lg:col-start-auto">
        <StatusPill status={c.status} />
      </div>
      <div className="col-start-2 min-w-0 truncate text-xs text-neutral-500 lg:col-start-auto">
        {SOURCE_LABELS[c.source.kind]}
        {c.source.page && <span className="block truncate text-neutral-400">{c.source.page}</span>}
      </div>
      <div className="col-start-2 text-xs lg:col-start-auto lg:text-right">
        {c.orders > 0 ? (
          <>
            {c.orders} · {money(c.revenue, c.currency)}
          </>
        ) : (
          <span className="text-neutral-400">{c.enquiries ? `${c.enquiries} enquir${c.enquiries > 1 ? "ies" : "y"}` : "—"}</span>
        )}
      </div>
      <div className="col-start-2 text-xs text-neutral-500 lg:col-start-auto lg:text-right">{formatDate(c.lastActivity, timeZone)}</div>
    </div>
  );
}
