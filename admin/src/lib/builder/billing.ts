import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withDoc } from "./doc-store";
import { legacySiteId, StoreError } from "./server";
import { notifyTeam } from "./notifications";
import { mailConnection } from "./smtp";
// Business model (Vova, 2026-11-18): one-off setup fee, then a hosting/maintenance
// subscription per website, monthly or yearly. Websites stay on Harbstone hosting.
// Card payments are not connected yet: invoices are marked paid by the owner.
export interface BillingSettings {
  currency: "EUR";
  setupFee: number;
  // Designer pack: a designer customises the website by hand.
  designerFee: number;
  designerHours: number;
  standardHours: number;
  monthly: number;
  yearly: number;
  // Days after the due date before the website is switched off.
  graceDays: number;
  // Reminder days after the due date.
  reminderDays: number[];
  // Paid modules: custom blocks a client paid for become part of the library and
  // are offered to other websites for a price.
  addons: Addon[];
}
export interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
}
export interface Subscription {
  siteId: string;
  companyId: string;
  orderId?: string;
  email: string;
  plan: "monthly" | "yearly";
  startedAt: string;
  // Hosting is paid up to this moment.
  paidUntil: string;
  status: "active" | "overdue" | "suspended";
}
export interface Invoice {
  id: string;
  number: string;
  companyId: string;
  siteId: string;
  orderId?: string;
  kind: "setup" | "subscription" | "addon" | "change";
  description: string;
  amount: number;
  currency: "EUR";
  issuedAt: string;
  dueAt: string;
  // Subscription period this invoice pays for.
  periodEnd?: string;
  paidAt?: string;
  status: "open" | "paid" | "void";
  reminders: number;
}
interface Store {
  settings: BillingSettings;
  next: number;
  subscriptions: Subscription[];
  invoices: Invoice[];
  // Modules enabled per website.
  siteAddons?: {
    siteId: string;
    addonId: string;
    addedAt: string;
    invoiceId: string;
  }[];
}
export const defaultSettings = (): BillingSettings => ({
  currency: "EUR",
  setupFee: 249,
  designerFee: 499,
  designerHours: 48,
  standardHours: 4,
  monthly: 7.99,
  yearly: 80,
  graceDays: 60,
  reminderDays: [3, 14, 30, 50],
  addons: [],
});
const store = <T>(fn: (data: Store) => T | Promise<T>, write = true) =>
  withDoc<Store, T>(
    "billing",
    () => ({
      settings: defaultSettings(),
      next: 1,
      subscriptions: [],
      invoices: [],
    }),
    fn,
    write,
  );
const day = 86400000;
const addPeriod = (from: string, plan: "monthly" | "yearly") => {
  const date = new Date(from);
  if (plan === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
};
function invoice(
  data: Store,
  input: Omit<
    Invoice,
    "id" | "number" | "issuedAt" | "status" | "reminders" | "currency"
  >,
) {
  const now = new Date();
  const item: Invoice = {
    ...input,
    id: randomUUID(),
    number: `HS-${now.getUTCFullYear()}-${String(data.next++).padStart(4, "0")}`,
    currency: "EUR",
    issuedAt: now.toISOString(),
    status: "open",
    reminders: 0,
  };
  data.invoices.unshift(item);
  return item;
}
export const settingsInput = z
  .object({
    setupFee: z.number().min(0).max(100000),
    designerFee: z.number().min(0).max(100000),
    designerHours: z.number().int().min(1).max(2000),
    standardHours: z.number().int().min(1).max(2000),
    monthly: z.number().min(0).max(10000),
    yearly: z.number().min(0).max(100000),
    graceDays: z.number().int().min(1).max(365),
    reminderDays: z.array(z.number().int().min(0).max(365)).max(10),
    addons: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,40}$/),
            name: z.string().trim().min(1).max(100),
            description: z.string().max(500),
            price: z.number().min(0).max(100000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const addonInput = z
  .object({
    siteId: z.string().regex(/^[a-z0-9]{1,40}$/),
    addonId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    companyId: z.string().regex(/^[a-z0-9]{1,40}$/),
  })
  .strict();
// Enables a paid module on a website and invoices it.
export const enableAddon = (input: z.infer<typeof addonInput>) =>
  store((data) => {
    const addon = (data.settings.addons || []).find(
      (a) => a.id === input.addonId,
    );
    if (!addon) throw new StoreError("Module not found.", 404);
    data.siteAddons ??= [];
    if (
      data.siteAddons.some(
        (a) => a.siteId === input.siteId && a.addonId === addon.id,
      )
    )
      throw new StoreError("This module is already enabled.", 409);
    const item = invoice(data, {
      companyId: input.companyId,
      siteId: input.siteId,
      kind: "addon",
      description: `Module: ${addon.name}`,
      amount: addon.price,
      dueAt: new Date(Date.now() + 14 * day).toISOString(),
    });
    data.siteAddons.push({
      siteId: input.siteId,
      addonId: addon.id,
      addedAt: new Date().toISOString(),
      invoiceId: item.id,
    });
    return item;
  });
export const readBilling = () =>
  store((data) => {
    data.settings = { ...defaultSettings(), ...data.settings };
    return structuredClone(data);
  }, false);
// Public prices for the order page.
export const publicPrices = () =>
  store((data) => {
    const s = { ...defaultSettings(), ...data.settings };
    return {
      currency: s.currency,
      standard: { fee: s.setupFee, hours: s.standardHours },
      designer: { fee: s.designerFee, hours: s.designerHours },
      monthly: s.monthly,
      yearly: s.yearly,
    };
  }, false);
export const saveSettings = (input: z.infer<typeof settingsInput>) =>
  store((data) => {
    data.settings = { ...data.settings, ...input };
    return data.settings;
  });
// A confirmed order starts billing: setup invoice + first subscription period.
export async function startBilling(input: {
  siteId: string;
  companyId: string;
  orderId: string;
  email: string;
  plan: "monthly" | "yearly";
  pack: "standard" | "designer";
  business: string;
}) {
  return store((data) => {
    data.settings = { ...defaultSettings(), ...data.settings };
    if (data.subscriptions.some((s) => s.siteId === input.siteId))
      throw new StoreError("Billing already exists for this website.", 409);
    const now = new Date().toISOString();
    const due = new Date(Date.now() + 14 * day).toISOString();
    data.subscriptions.push({
      siteId: input.siteId,
      companyId: input.companyId,
      orderId: input.orderId,
      email: input.email,
      plan: input.plan,
      startedAt: now,
      paidUntil: now,
      status: "active",
    });
    invoice(data, {
      companyId: input.companyId,
      siteId: input.siteId,
      orderId: input.orderId,
      kind: "setup",
      description: `Website creation${input.pack === "designer" ? " (designer pack)" : ""} — ${input.business}`,
      amount:
        input.pack === "designer"
          ? data.settings.designerFee
          : data.settings.setupFee,
      dueAt: due,
    });
    invoice(data, {
      companyId: input.companyId,
      siteId: input.siteId,
      orderId: input.orderId,
      kind: "subscription",
      description: `Hosting and maintenance, ${input.plan === "monthly" ? "1 month" : "1 year"} — ${input.business}`,
      amount:
        input.plan === "monthly" ? data.settings.monthly : data.settings.yearly,
      dueAt: due,
      periodEnd: addPeriod(now, input.plan),
    });
  });
}
export const invoiceAction = z
  .object({ id: z.string().max(100), action: z.enum(["paid", "void", "open"]) })
  .strict();
export async function setInvoice(id: string, action: "paid" | "void" | "open") {
  return store((data) => {
    const item = data.invoices.find((i) => i.id === id);
    if (!item) throw new StoreError("Invoice not found.", 404);
    const sub = data.subscriptions.find((s) => s.siteId === item.siteId);
    if (action === "paid" && item.status !== "paid") {
      item.status = "paid";
      item.paidAt = new Date().toISOString();
      if (item.kind === "subscription" && sub && item.periodEnd) {
        if (item.periodEnd > sub.paidUntil) sub.paidUntil = item.periodEnd;
      }
    } else if (action !== "paid") {
      // Undoing a paid subscription invoice takes back the period it added.
      if (
        item.status === "paid" &&
        item.kind === "subscription" &&
        sub &&
        item.periodEnd &&
        sub.paidUntil === item.periodEnd
      ) {
        const start = new Date(item.periodEnd);
        if (sub.plan === "monthly") start.setUTCMonth(start.getUTCMonth() - 1);
        else start.setUTCFullYear(start.getUTCFullYear() - 1);
        sub.paidUntil = start.toISOString();
      }
      item.status = action;
      item.paidAt = undefined;
    }
    if (sub) {
      const open = data.invoices.some(
        (i) =>
          i.siteId === sub.siteId &&
          i.status === "open" &&
          i.dueAt < new Date().toISOString(),
      );
      sub.status = open
        ? sub.status === "suspended"
          ? "suspended"
          : "overdue"
        : "active";
    }
    return item;
  });
}
// Daily run (cron or when the owner opens Billing): renewal invoices, reminders,
// suspension after the grace period. Returns what happened.
export async function runBilling(now = new Date()) {
  const notices: {
    title: string;
    text: string;
    email?: string;
    kind: "invoice-overdue" | "site-suspended";
    siteId: string;
  }[] = [];
  const result = await store((data) => {
    const iso = now.toISOString();
    let created = 0;
    for (const sub of data.subscriptions) {
      // Renewal invoice 7 days before the paid period ends.
      const hasOpen = data.invoices.some(
        (i) =>
          i.siteId === sub.siteId &&
          i.kind === "subscription" &&
          i.status === "open",
      );
      if (
        !hasOpen &&
        new Date(sub.paidUntil).getTime() - now.getTime() < 7 * day
      ) {
        invoice(data, {
          companyId: sub.companyId,
          siteId: sub.siteId,
          orderId: sub.orderId,
          kind: "subscription",
          description: `Hosting and maintenance, ${sub.plan === "monthly" ? "1 month" : "1 year"}`,
          amount:
            sub.plan === "monthly"
              ? data.settings.monthly
              : data.settings.yearly,
          dueAt: sub.paidUntil,
          periodEnd: addPeriod(sub.paidUntil, sub.plan),
        });
        created++;
      }
      const overdue = data.invoices
        .filter(
          (i) =>
            i.siteId === sub.siteId && i.status === "open" && i.dueAt < iso,
        )
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      if (!overdue.length) {
        if (sub.status !== "active") sub.status = "active";
        continue;
      }
      const days = Math.floor(
        (now.getTime() - new Date(overdue[0].dueAt).getTime()) / day,
      );
      if (days >= data.settings.graceDays) {
        if (sub.status !== "suspended") {
          sub.status = "suspended";
          notices.push({
            kind: "site-suspended",
            siteId: sub.siteId,
            title: "Website switched off for non-payment",
            text: `Invoice ${overdue[0].number} is ${days} days overdue.`,
            email: sub.email,
          });
        }
        continue;
      }
      sub.status = "overdue";
      for (const item of overdue) {
        const dueDays = Math.floor(
          (now.getTime() - new Date(item.dueAt).getTime()) / day,
        );
        const reached = data.settings.reminderDays.filter(
          (d) => dueDays >= d,
        ).length;
        if (reached > item.reminders) {
          item.reminders = reached;
          notices.push({
            kind: "invoice-overdue",
            siteId: sub.siteId,
            title: `Invoice ${item.number} is overdue`,
            text: `${item.description}: ${item.amount.toFixed(2)} ${item.currency}, ${dueDays} days overdue. The website is switched off after ${data.settings.graceDays} days.`,
            email: sub.email,
          });
        }
      }
    }
    return { created, reminders: notices.length };
  });
  for (const notice of notices) {
    await notifyTeam({
      kind: notice.kind,
      title: notice.title,
      text: notice.text,
      href: "/dashboard/billing",
    });
    if (notice.email)
      await emailClient(notice.email, notice.title, notice.text);
  }
  return result;
}
async function emailClient(to: string, subject: string, text: string) {
  let connection: Awaited<ReturnType<typeof mailConnection>> = null;
  try {
    connection = await mailConnection(legacySiteId);
    if (connection)
      await connection.transport.sendMail({
        from: connection.from,
        to,
        subject: subject.replace(/[\r\n]/g, " "),
        text,
      });
  } catch {
    // Reminder stays in the team notifications; email is best effort.
  } finally {
    connection?.transport.close();
  }
}
// Public pages of a switched-off website show a notice instead of the content.
export const siteSuspended = (siteId: string) =>
  store(
    (data) =>
      data.subscriptions.find((s) => s.siteId === siteId)?.status ===
      "suspended",
    false,
  ).catch(() => false);
// One-off invoice for an accepted change request.
export const invoiceChange = (input: {
  companyId: string;
  siteId: string;
  description: string;
  amount: number;
}) =>
  store((data) =>
    invoice(data, {
      ...input,
      kind: "change",
      dueAt: new Date(Date.now() + 14 * day).toISOString(),
    }),
  );
