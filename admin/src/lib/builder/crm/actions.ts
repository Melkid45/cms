import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { StoreError, readProject } from "../server";
import { withDoc } from "../doc-store";
import { listAccounts } from "../accounts";
import { canAccessSite, type Identity } from "../access";
import { ownerIdentity } from "../auth";
import type { Site } from "../sites";
import { analyticsReport, dayKey } from "../analytics";
import {
  CONTACT_STATUSES,
  STATUS_LABELS,
  normEmail,
  type Contact,
  type ContactDetail,
  type CrmData,
  type Deal,
  type OverviewData,
  type TeamMember,
  type TimelineItem,
} from "./shared";
import {
  LIMITS,
  addEvent,
  checkRevision,
  contactRows,
  crmStore,
  findContactFor,
  getContact,
  newContact,
  now,
  syncSources,
  type CrmDoc,
} from "./store";
import { samePhone } from "./shared";

// ------------------------------------------------------------- input schemas (server is the authority)
const text = (max: number) => z.string().trim().max(max);
const id = z.string().min(1).max(100);
const revision = z.number().int().nonnegative();
const tags = z
  .array(text(40).min(1))
  .max(20)
  .transform((list) => [...new Set(list.map((t) => t.toLowerCase()))]);
const email = z.union([z.literal(""), z.email().max(200)]);
const phone = z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s().-]{6,40}$/, "Check the phone number.")]);
const contactFields = z
  .object({
    name: text(200),
    email: email,
    phone: phone,
    company: text(200),
    language: text(10),
    status: z.enum(CONTACT_STATUSES),
    tags,
  })
  .strict();
const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const due = z.union([z.literal(""), z.iso.datetime({ offset: true, local: false })]);
const dealFields = z
  .object({
    title: text(200).min(1),
    contactId: id,
    stageId: text(40).min(1),
    value: z.number().min(0).max(1e10),
    currency: text(8).min(1),
    expectedDate: date,
    ownerId: text(100),
    submissionId: text(100).optional(),
    orderId: text(100).optional(),
  })
  .strict();
const taskFields = z
  .object({
    title: text(300).min(1),
    due,
    assigneeId: text(100),
    contactId: text(100).optional(),
    dealId: text(100).optional(),
  })
  .strict();
const importRow = z
  .object({
    name: text(200).default(""),
    email: z.string().trim().max(200).default(""),
    phone: z.string().trim().max(60).default(""),
    company: text(200).default(""),
    language: text(10).default(""),
    status: z.string().trim().max(20).default(""),
    tags: z.string().max(400).default(""),
    note: text(2000).default(""),
  })
  .strict();
export const crmAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("contact.create"), contact: contactFields.partial().extend({ name: text(200) }) }).strict(),
  z.object({ action: z.literal("contact.update"), id, revision, contact: contactFields.partial() }).strict(),
  z.object({ action: z.literal("contact.note"), id, text: text(4000).min(1) }).strict(),
  z.object({ action: z.literal("contact.merge"), id, revision, sourceIds: z.array(id).min(1).max(20) }).strict(),
  z.object({ action: z.literal("contact.delete"), ids: z.array(id).min(1).max(500) }).strict(),
  z.object({ action: z.literal("contact.import"), rows: z.array(importRow).min(1).max(2000) }).strict(),
  z.object({ action: z.literal("deal.create"), deal: dealFields }).strict(),
  z.object({ action: z.literal("deal.update"), id, revision, deal: dealFields.partial() }).strict(),
  z.object({ action: z.literal("deal.move"), id, revision, stageId: text(40).min(1), beforeId: text(100).optional() }).strict(),
  z.object({ action: z.literal("deal.delete"), id }).strict(),
  z.object({ action: z.literal("task.create"), task: taskFields }).strict(),
  z
    .object({
      action: z.literal("task.update"),
      id,
      revision,
      task: taskFields.partial().extend({ done: z.boolean().optional() }),
    })
    .strict(),
  z.object({ action: z.literal("task.delete"), id }).strict(),
  z
    .object({
      action: z.literal("stages.save"),
      revision,
      stages: z
        .array(
          z
            .object({
              id: text(40).regex(/^[a-z0-9-]*$/).optional(),
              name: text(40).min(1),
              kind: z.enum(["open", "won", "lost"]),
            })
            .strict(),
        )
        .min(2)
        .max(12),
    })
    .strict(),
  z
    .object({
      action: z.literal("settings.save"),
      revision,
      settings: z.object({ autoDeal: z.boolean(), currency: text(8).min(1) }).strict(),
    })
    .strict(),
]);
export type CrmAction = z.infer<typeof crmAction>;

// ------------------------------------------------------------- team of a website
// Deal owners and task assignees: the super admin and the client accounts of the website.
// Designers build websites and have no CRM access.
export async function crmTeam(site: Site): Promise<TeamMember[]> {
  const owner = ownerIdentity();
  const accounts = await listAccounts().catch(() => []);
  return [
    { id: owner.id, name: owner.name },
    ...accounts
      .filter((a) => !a.disabled && a.role === "client" && canAccessSite(a, site))
      .map((a) => ({ id: a.id, name: a.name || a.email })),
  ];
}

const customerEmails = (siteId: string) =>
  withDoc<{ users?: { email: string }[] }, Set<string>>(
    `customers:${siteId}`,
    () => ({ users: [] }),
    (d) => new Set((d.users || []).map((u) => normEmail(u.email))),
    false,
  ).catch(() => new Set<string>());

export async function crmData(site: Site, identity: Identity): Promise<CrmData> {
  const [{ submissions, orders }, team, emails, timeZone] = await Promise.all([
    syncSources(site.id),
    crmTeam(site),
    customerEmails(site.id),
    readProject(site.id)
      .then((p) => p.website?.timeZone || "UTC")
      .catch(() => "UTC"),
  ]);
  return crmStore(
    site.id,
    (data) => ({
      contacts: contactRows(data, submissions, orders, emails),
      deals: data.deals,
      tasks: data.tasks,
      stages: data.stages,
      stagesRevision: data.stagesRevision,
      settings: data.settings,
      settingsRevision: data.settingsRevision,
      team,
      me: identity.id,
      timeZone,
    }),
    false,
  );
}

export async function contactDetail(site: Site, contactId: string): Promise<ContactDetail> {
  const [{ submissions, orders }, emails] = await Promise.all([syncSources(site.id), customerEmails(site.id)]);
  return crmStore(
    site.id,
    (data) => {
      const contact = getContact(data, contactId);
      const [row] = contactRows({ ...data, contacts: [contact] }, submissions, orders, emails);
      const timeline: TimelineItem[] = [];
      for (const sid of contact.submissionIds) {
        const s = submissions.find((x) => x.id === sid);
        if (s)
          timeline.push({
            at: s.createdAt,
            kind: "enquiry",
            title: `Enquiry from “${s.pageTitle}”${s.flag ? ` (${s.flag})` : ""}`,
            text: Object.entries(s.values)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n"),
            href: "/dashboard/submissions",
          });
      }
      for (const oid of contact.orderIds) {
        const o = orders.find((x) => x.id === oid);
        if (o)
          timeline.push({
            at: o.createdAt,
            kind: "order",
            title: `Order #${o.number} · ${(o.total ?? o.subtotal).toFixed(2).replace(/\.00$/, "")} ${o.currency} · ${o.status}`,
            text: o.items.map((i) => `${i.qty} × ${i.name}`).join("\n"),
            href: "/dashboard/shop-orders",
          });
      }
      for (const e of contact.events)
        timeline.push({ at: e.at, kind: "event", title: e.kind === "note" ? "Note" : e.text, text: e.kind === "note" ? e.text : undefined, by: e.by });
      timeline.sort((a, b) => b.at.localeCompare(a.at));
      const duplicates = data.contacts
        .filter((c) => c.id !== contact.id)
        .map((c) => ({
          c,
          reason:
            contact.email && c.email && normEmail(c.email) === normEmail(contact.email)
              ? "same e-mail"
              : contact.phone && c.phone && samePhone(c.phone, contact.phone)
                ? "same phone"
                : contact.name && c.name && c.name.trim().toLowerCase() === contact.name.trim().toLowerCase()
                  ? "same name"
                  : "",
        }))
        .filter((x) => x.reason)
        .slice(0, 10)
        .map(({ c, reason }) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, reason }));
      return { contact: row, timeline, duplicates };
    },
    false,
  );
}

// ------------------------------------------------------------- mutations
function dealStage(data: CrmDoc, stageId: string) {
  const stage = data.stages.find((s) => s.id === stageId);
  if (!stage) throw new StoreError("Choose a pipeline stage.");
  return stage;
}
function checkPerson(team: TeamMember[], value: string | undefined) {
  if (value && !team.some((m) => m.id === value)) throw new StoreError("Choose a team member of this website.");
}
const stageSlug = (name: string, taken: Set<string>) => {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "stage";
  let slug = base,
    n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
};
function touch<T extends { revision: number; updatedAt?: string }>(item: T) {
  item.revision++;
  if ("updatedAt" in item) item.updatedAt = now();
}
const contactLabel = (c: Contact) => c.name || c.email || c.phone || "Contact";

export async function runAction(site: Site, identity: Identity, input: CrmAction) {
  const team = await crmTeam(site);
  const by = identity.name || identity.email || "Team";
  return crmStore(site.id, (data) => {
    switch (input.action) {
      case "contact.create": {
        if (data.contacts.length >= LIMITS.contacts) throw new StoreError("The contact list is full.", 409);
        const fields = input.contact;
        if (!fields.name && !fields.email && !fields.phone) throw new StoreError("Enter a name, e-mail or phone.");
        const existing = findContactFor(data, fields.email || "", fields.phone || "");
        if (existing)
          throw new StoreError(`${contactLabel(existing)} already has this e-mail or phone.`, 409);
        const contact = newContact({ ...fields, tags: fields.tags || [], source: { kind: "manual" } }, by);
        data.contacts.unshift(contact);
        return { id: contact.id };
      }
      case "contact.update": {
        const contact = getContact(data, input.id);
        checkRevision(contact, input.revision, "contact");
        const changed: string[] = [];
        for (const [key, value] of Object.entries(input.contact) as [keyof typeof input.contact, never][]) {
          if (JSON.stringify(contact[key]) === JSON.stringify(value)) continue;
          if (key === "status")
            addEvent(contact, by, "status", `Status: ${STATUS_LABELS[contact.status]} → ${STATUS_LABELS[value as Contact["status"]]}`);
          else changed.push(key);
          (contact as unknown as Record<string, unknown>)[key] = value;
        }
        if (changed.length) addEvent(contact, by, "edit", `Edited: ${changed.join(", ")}`);
        touch(contact);
        return { id: contact.id };
      }
      case "contact.note": {
        const contact = getContact(data, input.id);
        addEvent(contact, by, "note", input.text);
        touch(contact);
        return { id: contact.id };
      }
      case "contact.merge": {
        const target = getContact(data, input.id);
        checkRevision(target, input.revision, "contact");
        for (const sourceId of input.sourceIds) {
          if (sourceId === target.id) continue;
          const source = getContact(data, sourceId);
          for (const key of ["name", "email", "phone", "company", "language"] as const)
            if (!target[key] && source[key]) target[key] = source[key];
          target.tags = [...new Set([...target.tags, ...source.tags])].slice(0, 20);
          target.submissionIds = [...new Set([...target.submissionIds, ...source.submissionIds])];
          target.orderIds = [...new Set([...target.orderIds, ...source.orderIds])];
          if (source.bookingIds?.length) target.bookingIds = [...new Set([...(target.bookingIds || []), ...source.bookingIds])];
          if (source.status === "customer") target.status = "customer";
          if (source.test) target.test = true;
          target.events = [...target.events, ...source.events]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, LIMITS.events);
          for (const d of data.deals) if (d.contactId === source.id) d.contactId = target.id;
          for (const t of data.tasks) if (t.contactId === source.id) t.contactId = target.id;
          addEvent(target, by, "merge", `Merged with ${contactLabel(source)}${source.email ? ` <${source.email}>` : ""}`);
          data.contacts = data.contacts.filter((c) => c.id !== source.id);
        }
        touch(target);
        return { id: target.id };
      }
      case "contact.delete": {
        const remove = new Set(input.ids);
        const before = data.contacts.length;
        data.contacts = data.contacts.filter((c) => !remove.has(c.id));
        data.deals = data.deals.filter((d) => !remove.has(d.contactId));
        for (const t of data.tasks) if (t.contactId && remove.has(t.contactId)) delete t.contactId;
        return { deleted: before - data.contacts.length };
      }
      case "contact.import": {
        let created = 0,
          updated = 0,
          skipped = 0;
        for (const row of input.rows) {
          const mail = z.email().safeParse(row.email).success ? row.email : "";
          const tel = /^\+?[\d\s().-]{6,40}$/.test(row.phone) ? row.phone : "";
          if (!row.name && !mail && !tel) {
            skipped++;
            continue;
          }
          const status = (CONTACT_STATUSES as readonly string[]).includes(row.status.toLowerCase())
            ? (row.status.toLowerCase() as Contact["status"])
            : undefined;
          const rowTags = row.tags
            .split(/[;,]/)
            .map((t) => t.trim().toLowerCase().slice(0, 40))
            .filter(Boolean);
          let contact = findContactFor(data, mail, tel);
          if (contact) {
            for (const [key, value] of [
              ["name", row.name],
              ["email", mail],
              ["phone", tel],
              ["company", row.company],
              ["language", row.language],
            ] as const)
              if (!contact[key] && value) contact[key] = value;
            contact.tags = [...new Set([...contact.tags, ...rowTags])].slice(0, 20);
            if (status) contact.status = status;
            addEvent(contact, by, "edit", "Updated from a CSV import");
            touch(contact);
            updated++;
          } else {
            if (data.contacts.length >= LIMITS.contacts) {
              skipped++;
              continue;
            }
            contact = newContact(
              {
                name: row.name,
                email: mail,
                phone: tel,
                company: row.company,
                language: row.language,
                status: status || "lead",
                tags: rowTags.slice(0, 20),
                source: { kind: "import" },
              },
              by,
            );
            data.contacts.unshift(contact);
            created++;
          }
          if (row.note) addEvent(contact, by, "note", row.note);
        }
        return { created, updated, skipped };
      }
      case "deal.create": {
        if (data.deals.length >= LIMITS.deals) throw new StoreError("The pipeline is full.", 409);
        const contact = getContact(data, input.deal.contactId);
        const stage = dealStage(data, input.deal.stageId);
        checkPerson(team, input.deal.ownerId);
        const at = now();
        const deal: Deal = {
          ...input.deal,
          id: randomUUID(),
          position: Math.min(0, ...data.deals.filter((d) => d.stageId === stage.id).map((d) => d.position)) - 1,
          createdAt: at,
          updatedAt: at,
          revision: 0,
          ...(stage.kind !== "open" ? { closedAt: at } : {}),
        };
        data.deals.push(deal);
        addEvent(contact, by, "deal", `Deal created: ${deal.title} (${stage.name})`);
        touch(contact);
        return { id: deal.id };
      }
      case "deal.update":
      case "deal.move": {
        const deal = data.deals.find((d) => d.id === input.id);
        if (!deal) throw new StoreError("Deal not found.", 404);
        checkRevision(deal, input.revision, "deal");
        const patch = input.action === "deal.update" ? input.deal : { stageId: input.stageId };
        if (patch.contactId) getContact(data, patch.contactId);
        if (patch.ownerId !== undefined) checkPerson(team, patch.ownerId);
        const from = dealStage(data, deal.stageId);
        Object.assign(deal, patch);
        const to = dealStage(data, deal.stageId);
        if (input.action === "deal.move") {
          // Place before the given card (or at the end of the column).
          const column = data.deals
            .filter((d) => d.stageId === to.id && d.id !== deal.id)
            .sort((a, b) => a.position - b.position);
          const index = input.beforeId ? column.findIndex((d) => d.id === input.beforeId) : -1;
          column.splice(index < 0 ? column.length : index, 0, deal);
          column.forEach((d, i) => (d.position = i));
        }
        if (from.id !== to.id) {
          deal.closedAt = to.kind === "open" ? undefined : now();
          const contact = data.contacts.find((c) => c.id === deal.contactId);
          if (contact) {
            addEvent(contact, by, "deal", `Deal “${deal.title}”: ${from.name} → ${to.name}`);
            if (to.kind === "won" && contact.status !== "customer") {
              addEvent(contact, by, "status", `Status: ${STATUS_LABELS[contact.status]} → ${STATUS_LABELS.customer}`);
              contact.status = "customer";
            }
            touch(contact);
          }
        }
        touch(deal);
        return { id: deal.id };
      }
      case "deal.delete": {
        data.deals = data.deals.filter((d) => d.id !== input.id);
        for (const t of data.tasks) if (t.dealId === input.id) delete t.dealId;
        return { ok: true };
      }
      case "task.create": {
        if (data.tasks.length >= LIMITS.tasks) throw new StoreError("The task list is full.", 409);
        checkPerson(team, input.task.assigneeId);
        if (input.task.contactId) getContact(data, input.task.contactId);
        if (input.task.dealId && !data.deals.some((d) => d.id === input.task.dealId))
          throw new StoreError("Deal not found.", 404);
        const task = {
          ...input.task,
          id: randomUUID(),
          done: false,
          createdAt: now(),
          createdBy: by,
          revision: 0,
        };
        data.tasks.push(task);
        const contact = data.contacts.find((c) => c.id === task.contactId);
        if (contact) addEvent(contact, by, "task", `Task added: ${task.title}`);
        return { id: task.id };
      }
      case "task.update": {
        const task = data.tasks.find((t) => t.id === input.id);
        if (!task) throw new StoreError("Task not found.", 404);
        checkRevision(task, input.revision, "task");
        checkPerson(team, input.task.assigneeId);
        if (input.task.contactId) getContact(data, input.task.contactId);
        const wasDone = task.done;
        if (input.task.due !== undefined && input.task.due !== task.due) delete task.remindedAt;
        Object.assign(task, input.task);
        if (task.done && !wasDone) {
          task.doneAt = now();
          const contact = data.contacts.find((c) => c.id === task.contactId);
          if (contact) addEvent(contact, by, "task", `Task done: ${task.title}`);
        }
        if (!task.done) delete task.doneAt;
        task.revision++;
        return { id: task.id };
      }
      case "task.delete": {
        data.tasks = data.tasks.filter((t) => t.id !== input.id);
        return { ok: true };
      }
      case "stages.save": {
        if (data.stagesRevision !== input.revision)
          throw new StoreError("The stages were changed elsewhere. Refresh and try again.", 409);
        if (!input.stages.some((s) => s.kind === "open")) throw new StoreError("Keep at least one open stage.");
        const taken = new Set<string>();
        const stages = input.stages.map((s) => {
          const keep = s.id && data.stages.some((x) => x.id === s.id) && !taken.has(s.id);
          if (keep) taken.add(s.id!);
          return { id: keep ? s.id! : "", name: s.name, kind: s.kind };
        });
        for (const s of stages) if (!s.id) s.id = stageSlug(s.name, taken);
        const first = stages.find((s) => s.kind === "open")!;
        // Deals of a removed stage go to the first open stage.
        for (const d of data.deals) if (!stages.some((s) => s.id === d.stageId)) d.stageId = first.id;
        data.stages = stages;
        data.stagesRevision++;
        return { ok: true };
      }
      case "settings.save": {
        if (data.settingsRevision !== input.revision)
          throw new StoreError("The settings were changed elsewhere. Refresh and try again.", 409);
        data.settings = input.settings;
        data.settingsRevision++;
        return { ok: true };
      }
    }
  });
}

// ------------------------------------------------------------- overview (dashboard home)
export async function crmOverview(site: Site): Promise<OverviewData> {
  const [{ submissions, orders }, project] = await Promise.all([syncSources(site.id), readProject(site.id)]);
  const timeZone = project.website?.timeZone || "UTC";
  const today = dayKey(new Date(), timeZone);
  const isToday = (iso: string) => dayKey(new Date(iso), timeZone) === today;
  let visitors: number | null = null;
  try {
    const report = await analyticsReport(site.id, 1);
    visitors = report.totals.visitors;
  } catch {
    visitors = null;
  }
  return crmStore(
    site.id,
    (data) => {
      const open = new Set(data.stages.filter((s) => s.kind === "open").map((s) => s.id));
      const openDeals = data.deals.filter((d) => open.has(d.stageId));
      const endOfToday = (() => {
        // Tasks due today = due before the end of today in the website time zone.
        let t = Date.now();
        while (dayKey(new Date(t), timeZone) === today) t += 15 * 60000;
        return t;
      })();
      const pending = data.tasks.filter((t) => !t.done && t.due);
      const todayOrders = orders.filter((o) => isToday(o.createdAt) && o.status !== "cancelled");
      const revenue: Record<string, number> = {};
      for (const o of todayOrders) revenue[o.currency] = (revenue[o.currency] || 0) + (o.total ?? o.subtotal);
      const findBySubmission = (sid: string) => data.contacts.find((c) => c.submissionIds.includes(sid));
      const findByOrder = (oid: string) => data.contacts.find((c) => c.orderIds.includes(oid));
      const activity: TimelineItem[] = [
        ...submissions
          .filter((s) => !s.flag)
          .slice(0, 15)
          .map((s) => {
            const c = findBySubmission(s.id);
            return {
              at: s.createdAt,
              kind: "enquiry" as const,
              title: `Enquiry${c ? ` from ${contactLabel(c)}` : ""}`,
              text: s.pageTitle,
              href: c ? `/dashboard/crm/${c.id}` : "/dashboard/submissions",
            };
          }),
        ...orders.slice(0, 15).map((o) => {
          const c = findByOrder(o.id);
          return {
            at: o.createdAt,
            kind: "order" as const,
            title: `Order #${o.number} · ${(o.total ?? o.subtotal).toFixed(2).replace(/\.00$/, "")} ${o.currency}`,
            text: o.customer.name,
            href: c ? `/dashboard/crm/${c.id}` : "/dashboard/shop-orders",
          };
        }),
        ...data.contacts
          .flatMap((c) =>
            c.events
              .filter((e) => ["note", "status", "deal", "task", "merge", "booking"].includes(e.kind))
              .slice(0, 5)
              .map((e) => ({
                at: e.at,
                kind: (e.kind === "deal" ? "deal" : e.kind === "task" ? "task" : "event") as TimelineItem["kind"],
                title: e.kind === "note" ? `Note on ${contactLabel(c)}` : `${contactLabel(c)}: ${e.text}`,
                text: e.kind === "note" ? e.text.slice(0, 200) : undefined,
                by: e.by,
                href: `/dashboard/crm/${c.id}`,
              })),
          ),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 15);
      return {
        timeZone,
        today,
        enquiries: submissions.filter((s) => !s.flag && isToday(s.createdAt)).length,
        orders: todayOrders.length,
        revenue,
        openDeals: openDeals.length,
        openValue: openDeals.reduce((sum, d) => sum + d.value, 0),
        currency: data.settings.currency,
        tasksDue: pending.filter((t) => Date.parse(t.due) < endOfToday).length,
        overdue: pending.filter((t) => Date.parse(t.due) < Date.now()).length,
        visitors,
        shop: orders.length > 0,
        activity,
      };
    },
    false,
  );
}

// Badge in the menu: overdue open tasks of the website (all of them; "mine" for the list).
export const overdueCount = (siteId: string, me: string) =>
  crmStore(
    siteId,
    (data) => {
      const late = data.tasks.filter((t) => !t.done && t.due && Date.parse(t.due) < Date.now());
      return { overdue: late.length, mine: late.filter((t) => t.assigneeId === me).length };
    },
    false,
  );
