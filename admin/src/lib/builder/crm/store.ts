import "server-only";
import { randomUUID } from "node:crypto";
import { withDoc } from "../doc-store";
import { readProject, StoreError } from "../server";
import { listSubmissions, type Submission } from "../submissions";
import { listShopOrders, type ShopOrder } from "../shop";
import {
  DEFAULT_STAGES,
  isEmail,
  isPhone,
  normEmail,
  samePhone,
  type Contact,
  type ContactRow,
  type CrmEvent,
  type CrmSettings,
  type Deal,
  type Stage,
  type Task,
} from "./shared";

// CRM of one website: contacts (made from enquiries and shop orders, or by hand), deals on
// a pipeline with editable stages, and tasks. One locked document per website:
// `crm:{siteId}` (PostgreSQL row or .data/crm-{siteId}.json). Enquiries and orders stay in
// their own stores; contacts keep only their ids, figures are computed when read.

export interface CrmDoc {
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  stages: Stage[];
  stagesRevision: number;
  settings: CrmSettings;
  settingsRevision: number;
  // Enquiry / order ids already turned into contacts (so deleting a contact sticks).
  synced: { s: string[]; o: string[] };
}
export const LIMITS = { contacts: 5000, deals: 5000, tasks: 5000, events: 300 };
const empty = (): CrmDoc => ({
  contacts: [],
  deals: [],
  tasks: [],
  stages: DEFAULT_STAGES.map((s) => ({ ...s })),
  stagesRevision: 0,
  settings: { autoDeal: false, currency: "EUR" },
  settingsRevision: 0,
  synced: { s: [], o: [] },
});
export function crmStore<T>(
  siteId: string,
  fn: (data: CrmDoc) => T | Promise<T>,
  write = true,
) {
  return withDoc<CrmDoc, T>(
    `crm:${siteId}`,
    empty,
    (data) => {
      // Documents written by older versions get the missing parts.
      const base = empty();
      for (const key of Object.keys(base) as (keyof CrmDoc)[])
        if (data[key] === undefined) (data as unknown as Record<string, unknown>)[key] = base[key];
      return fn(data);
    },
    write,
  );
}

export const now = () => new Date().toISOString();
export function addEvent(
  contact: Contact,
  by: string,
  kind: CrmEvent["kind"],
  text: string,
  at = now(),
) {
  contact.events.unshift({ id: randomUUID(), at, by, kind, text: text.slice(0, 4000) });
  contact.events = contact.events.slice(0, LIMITS.events);
}
export function findContactFor(data: CrmDoc, email: string, phone: string) {
  const mail = email ? normEmail(email) : "";
  return (
    (mail && data.contacts.find((c) => c.email && normEmail(c.email) === mail)) ||
    (phone && data.contacts.find((c) => c.phone && samePhone(c.phone, phone))) ||
    undefined
  );
}
export function getContact(data: CrmDoc, id: string) {
  const contact = data.contacts.find((c) => c.id === id);
  if (!contact) throw new StoreError("Contact not found.", 404);
  return contact;
}
export function checkRevision(item: { revision: number }, revision: number, what: string) {
  if (item.revision !== revision)
    throw new StoreError(`This ${what} was changed elsewhere. Refresh and try again.`, 409);
}
export function newContact(
  input: Partial<Contact> & Pick<Contact, "source">,
  by: string,
  at = now(),
): Contact {
  const contact: Contact = {
    id: randomUUID(),
    name: "",
    email: "",
    phone: "",
    company: "",
    language: "",
    status: "lead",
    tags: [],
    submissionIds: [],
    orderIds: [],
    events: [],
    createdAt: at,
    updatedAt: at,
    revision: 0,
    ...input,
  };
  addEvent(contact, by, "created", `Contact created (${contact.source.kind})`, at);
  return contact;
}

// ------------------------------------------------------------- enquiries and orders → contacts
// Reads the usual field names of the library forms (name, email, phone, company, contact)
// and falls back to any value that looks like an e-mail / phone number.
export function enquiryPerson(values: Record<string, string>) {
  const get = (...keys: string[]) =>
    keys.map((k) => (values[k] || "").trim()).find(Boolean) || "";
  const all = Object.values(values).map((v) => v.trim());
  let email = get("email", "e-mail", "mail");
  let phone = get("phone", "tel", "telephone", "mobile");
  const contact = get("contact", "login");
  if (!email && isEmail(contact)) email = contact;
  if (!phone && isPhone(contact) && !isEmail(contact)) phone = contact;
  if (!email) email = all.find(isEmail) || "";
  if (!isEmail(email)) email = "";
  if (phone && !isPhone(phone)) phone = "";
  const name =
    get("name", "full_name", "fullname", "your-name") ||
    [get("first_name", "firstname"), get("last_name", "lastname", "surname")]
      .filter(Boolean)
      .join(" ");
  const utm = {
    source: get("utm_source"),
    medium: get("utm_medium"),
    campaign: get("utm_campaign"),
  };
  return {
    name: name.slice(0, 200),
    email: email.slice(0, 200),
    phone: phone.slice(0, 60),
    company: get("company", "organisation", "organization").slice(0, 200),
    utm: utm.source || utm.medium || utm.campaign ? utm : undefined,
  };
}
function fillEmpty(contact: Contact, person: Partial<Contact>) {
  for (const key of ["name", "email", "phone", "company", "language"] as const)
    if (!contact[key] && person[key]) contact[key] = person[key]!;
}
type PageInfo = Map<string, { title: string; locale: string }>;
function ingestSubmission(
  data: CrmDoc,
  item: Submission,
  pages: PageInfo,
  by = "Website",
) {
  if (data.synced.s.includes(item.id)) return null;
  data.synced.s.push(item.id);
  if (item.flag) return null;
  const person = enquiryPerson(item.values);
  if (!person.email && !person.phone && !person.name) return null;
  const page = pages.get(item.pageId);
  const { utm, ...fields } = person;
  let contact = findContactFor(data, fields.email, fields.phone);
  if (!contact) {
    if (data.contacts.length >= LIMITS.contacts) return null;
    contact = newContact(
      {
        ...fields,
        language: page?.locale || "",
        source: { kind: "enquiry", page: item.pageTitle, ...(utm ? { utm } : {}) },
      },
      by,
      item.createdAt,
    );
    data.contacts.unshift(contact);
  } else {
    fillEmpty(contact, { ...fields, language: page?.locale || "" });
    contact.revision++;
    contact.updatedAt = now();
  }
  if (!contact.submissionIds.includes(item.id)) contact.submissionIds.unshift(item.id);
  return contact;
}
function ingestOrder(data: CrmDoc, order: ShopOrder, by = "Website") {
  if (data.synced.o.includes(order.id)) return null;
  data.synced.o.push(order.id);
  const c = order.customer;
  const person = {
    name: c.name.slice(0, 200),
    email: isEmail(c.email || "") ? c.email : "",
    phone: c.phone || "",
    company: c.type === "company" ? c.name.slice(0, 200) : "",
    language: order.locale || "",
  };
  let contact = findContactFor(data, person.email, person.phone);
  if (!contact) {
    if (data.contacts.length >= LIMITS.contacts) return null;
    contact = newContact(
      { ...person, status: "customer", source: { kind: "order", page: `Order #${order.number}` } },
      by,
      order.createdAt,
    );
    data.contacts.unshift(contact);
  } else {
    fillEmpty(contact, person);
    if (contact.status !== "customer") {
      addEvent(contact, by, "status", `Status: customer (order #${order.number})`);
      contact.status = "customer";
    }
    contact.revision++;
    contact.updatedAt = now();
  }
  if (!contact.orderIds.includes(order.id)) contact.orderIds.unshift(order.id);
  return contact;
}
const pageMap = async (siteId: string): Promise<PageInfo> => {
  try {
    const project = await readProject(siteId);
    return new Map(
      project.pages.map((p) => [p.id, { title: p.title, locale: p.locale || project.languages?.default || "" }]),
    );
  } catch {
    return new Map();
  }
};
// Brings enquiries and orders that are not contacts yet into the CRM (backfill + safety net
// for the live hooks). Cheap when nothing is new: one read of each store.
export async function syncSources(siteId: string) {
  const [submissions, orders] = await Promise.all([
    listSubmissions(siteId).catch(() => [] as Submission[]),
    listShopOrders(siteId).catch(() => [] as ShopOrder[]),
  ]);
  const known = await crmStore(siteId, (d) => ({ s: new Set(d.synced.s), o: new Set(d.synced.o) }), false);
  const newS = submissions.filter((s) => !known.s.has(s.id)).reverse();
  const newO = orders.filter((o) => !known.o.has(o.id)).reverse();
  if (!newS.length && !newO.length) return { submissions, orders };
  const pages = await pageMap(siteId);
  // Oldest first, so the first enquiry of a person decides the contact's source.
  const items = [
    ...newS.map((s) => ({ at: s.createdAt, s })),
    ...newO.map((o) => ({ at: o.createdAt, o })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  await crmStore(siteId, (data) => {
    for (const entry of items)
      if ("s" in entry && entry.s) ingestSubmission(data, entry.s, pages);
      else if ("o" in entry && entry.o) ingestOrder(data, entry.o);
    data.synced.s = data.synced.s.slice(-12000);
    data.synced.o = data.synced.o.slice(-12000);
  });
  return { submissions, orders };
}
// Live hook for one new enquiry: contact + optional deal. Returns what was created.
export async function ingestNewEnquiry(siteId: string, item: Submission) {
  const pages = await pageMap(siteId);
  return crmStore(siteId, (data) => {
    const contact = ingestSubmission(data, item, pages);
    let deal: Deal | null = null;
    if (contact && data.settings.autoDeal && data.deals.length < LIMITS.deals) {
      const stage = data.stages.find((s) => s.kind === "open") ?? data.stages[0];
      const at = now();
      deal = {
        id: randomUUID(),
        title: `${contact.name || contact.email || contact.phone} — ${item.pageTitle}`.slice(0, 200),
        contactId: contact.id,
        stageId: stage.id,
        value: 0,
        currency: data.settings.currency,
        expectedDate: "",
        ownerId: "",
        submissionId: item.id,
        position: -Date.now(),
        createdAt: at,
        updatedAt: at,
        revision: 0,
      };
      data.deals.push(deal);
      addEvent(contact, "Website", "deal", `Deal created from the enquiry: ${deal.title}`);
    }
    return { contact, deal };
  });
}
export async function ingestNewOrder(siteId: string, order: ShopOrder) {
  return crmStore(siteId, (data) => ingestOrder(data, order));
}

// ------------------------------------------------------------- reading
const activeOrder = (o: ShopOrder) => o.status !== "cancelled";
export function contactRows(
  data: CrmDoc,
  submissions: Submission[],
  orders: ShopOrder[],
  customerEmails: Set<string>,
): ContactRow[] {
  const sById = new Map(submissions.map((s) => [s.id, s]));
  const oById = new Map(orders.map((o) => [o.id, o]));
  return data.contacts.map((contact) => {
    const own = contact.orderIds.map((id) => oById.get(id)).filter((o): o is ShopOrder => !!o);
    const enquiries = contact.submissionIds.map((id) => sById.get(id)).filter(Boolean) as Submission[];
    const dates = [
      contact.events[0]?.at,
      ...own.map((o) => o.createdAt),
      ...enquiries.map((s) => s.createdAt),
    ].filter(Boolean) as string[];
    const { events: _events, ...rest } = contact;
    void _events;
    return {
      ...rest,
      enquiries: enquiries.length,
      orders: own.filter(activeOrder).length,
      revenue: own.filter(activeOrder).reduce((sum, o) => sum + (o.total ?? o.subtotal), 0),
      currency: own[0]?.currency || data.settings.currency,
      deals: data.deals.filter((d) => d.contactId === contact.id).length,
      lastActivity: dates.sort().at(-1) || contact.updatedAt,
      customerAccount: !!contact.email && customerEmails.has(normEmail(contact.email)),
    };
  });
}

// ------------------------------------------------------------- online bookings → contacts
// A booking (lib/builder/booking) creates or updates the contact (matched by e-mail, then
// phone) and adds a timeline event; later status changes add events to the same contact.
export interface BookingFacts {
  id: string;
  number: number;
  service: string;
  staff: string;
  when: string; // "yyyy-mm-dd hh:mm"
  status: string;
  customer: { name: string; phone: string; email: string };
  locale: string;
  test?: boolean;
}
export async function ingestBooking(siteId: string, b: BookingFacts, text: string, by = "Website") {
  return crmStore(siteId, (data) => {
    let contact =
      data.contacts.find((c) => c.bookingIds?.includes(b.id)) ||
      findContactFor(data, isEmail(b.customer.email) ? b.customer.email : "", b.customer.phone);
    const person = {
      name: b.customer.name.slice(0, 200),
      email: isEmail(b.customer.email) ? b.customer.email : "",
      phone: b.customer.phone.slice(0, 60),
      language: b.locale || "",
    };
    if (!contact) {
      if (data.contacts.length >= LIMITS.contacts) return null;
      contact = newContact(
        { ...person, source: { kind: "booking", page: `Booking #${b.number}` }, ...(b.test ? { test: true } : {}) },
        by,
      );
      data.contacts.unshift(contact);
    } else {
      fillEmpty(contact, person);
      contact.revision++;
      contact.updatedAt = now();
    }
    contact.bookingIds = [b.id, ...(contact.bookingIds || []).filter((x) => x !== b.id)].slice(0, 500);
    addEvent(contact, by, "booking", text);
    return contact;
  });
}
