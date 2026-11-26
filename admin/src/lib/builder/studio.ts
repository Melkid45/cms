import "server-only";
import type { Identity, Role } from "./access";
import { listAccounts } from "./accounts";
import { readBilling } from "./billing";
import { listRequests } from "./change-requests";
import { withDoc } from "./doc-store";
import type { DomainsDocument } from "./domains/names";
import { listNotifications } from "./notifications";
import { listOrders } from "./orders";
import { readRegistry } from "./sites";
import { database, siteDirectory, siteDocumentId } from "./server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Read-only studio overview for the owner: what needs action across all clients.
// Studio-level facts only (websites, logins, billing, website orders); the clients' own
// business activity (enquiries, shop orders, CRM) is theirs and is not read here (Vova,
// 2026-11-22), so the page stays cheap with many clients. Every source fails soft.
export interface StudioSite {
  domain?: string;
  domainLive?: boolean;
  subscription?: "active" | "overdue" | "suspended";
  // Hosting is paid up to this moment (subscription).
  paidUntil?: string;
  // Hosting plan of the subscription and its current price.
  plan?: { kind: "monthly" | "yearly"; price: number };
  // At least one published page (the website is public).
  live: boolean;
  // Pages (one per language counted once), languages, last publish, brand logo.
  pages: number;
  languages: string[];
  publishedAt?: string;
  logo?: string;
  color?: string;
  // Last change of the website (project document), else its creation date.
  updatedAt: string;
  // Open website orders and change requests of this website.
  openOrders: number;
  openRequests: number;
}
export interface StudioAccount {
  id: string;
  name: string;
  email: string;
  role?: Role;
  disabled: boolean;
  scope: { companies: string[]; sites: string[] };
}
export interface StudioData {
  sites: Record<string, StudioSite>;
  accounts: StudioAccount[];
  openOrders: number;
  orders: {
    id: string;
    number: number;
    status: string;
    name: string;
    needsAction?: string;
    updatedAt: string;
    siteId?: string;
  }[];
  openRequests: number;
  requests: {
    id: string;
    number: number;
    siteId: string;
    author: string;
    text: string;
    status: string;
    createdAt: string;
  }[];
  invoices: {
    id: string;
    number: string;
    siteId: string;
    description: string;
    amount: number;
    dueAt: string;
    overdue: boolean;
  }[];
  // Latest invoices of every status (up to 10 per website): the client billing tab.
  history: {
    id: string;
    number: string;
    siteId: string;
    description: string;
    amount: number;
    issuedAt: string;
    dueAt: string;
    status: "open" | "paid" | "void";
    overdue: boolean;
  }[];
  unpaidTotal: number;
  unpaidCount: number;
  overdueCount: number;
  unreadNotifications: number;
  notifications: {
    id: string;
    at: string;
    title: string;
    text: string;
    href?: string;
    siteId?: string;
  }[];
}

// Facts of each website for the studio: published or not, pages, languages, last publish,
// logo. PostgreSQL answers in one query; local project files (can be tens of MB) are parsed
// once per change and remembered by mtime.
export interface SiteFacts {
  live: boolean;
  pages: number;
  languages: string[];
  publishedAt?: string;
  logo?: string;
  // Brand primary colour: background of the logo tile (logos are made for the header).
  color?: string;
  updatedAt?: string;
}
type ProjectLike = {
  pages?: {
    status?: string;
    deletedAt?: string;
    locale?: string;
    published?: { updatedAt?: string };
  }[];
  languages?: { enabled?: string[] };
  brand?: { logo?: string; primary?: string };
};
function factsOf(project: ProjectLike): SiteFacts {
  const pages = (project.pages ?? []).filter((page) => !page.deletedAt);
  const languages = project.languages?.enabled?.length
    ? project.languages.enabled
    : [...new Set(pages.map((page) => page.locale).filter((l): l is string => !!l))];
  const published = pages
    .map((page) => page.published?.updatedAt)
    .filter((at): at is string => !!at)
    .sort();
  return {
    live: pages.some((page) => page.status === "Published"),
    // One page per language counts once.
    pages: Math.round(pages.length / Math.max(1, languages.length)),
    languages,
    publishedAt: published.at(-1),
    logo: project.brand?.logo || undefined,
    color: project.brand?.primary || undefined,
  };
}
const factsCache = globalThis as typeof globalThis & {
  studioFactsV2?: Map<string, { mtime: number; facts: SiteFacts }>;
};
async function siteFacts(siteIds: string[]): Promise<Map<string, SiteFacts>> {
  const result = new Map<string, SiteFacts>();
  const sql = await database();
  if (sql) {
    const ids = siteIds.map((id) => siteDocumentId(id, "project"));
    const rows = await sql`
      SELECT id,
        jsonb_build_object(
          'pages', (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'status', p->'status', 'deletedAt', p->'deletedAt', 'locale', p->'locale',
              'published', jsonb_build_object('updatedAt', p->'published'->'updatedAt'))), '[]'::jsonb)
            FROM jsonb_array_elements(document->'pages') p),
          'languages', document->'languages',
          'brand', jsonb_build_object('logo', document->'brand'->'logo', 'primary', document->'brand'->'primary')
        ) AS facts
      FROM harbstone_project WHERE id = ANY(${ids})`;
    for (const id of siteIds) {
      const row = rows.find((item) => item.id === siteDocumentId(id, "project"));
      if (row) result.set(id, factsOf(row.facts as ProjectLike));
    }
    return result;
  }
  const cache = (factsCache.studioFactsV2 ??= new Map());
  await Promise.all(
    siteIds.map(async (id) => {
      const file = path.join(siteDirectory(id), "project.json");
      const info = await stat(file).catch(() => null);
      if (!info) return;
      let entry = cache.get(id);
      if (entry?.mtime !== info.mtimeMs) {
        let facts: SiteFacts = { live: false, pages: 0, languages: [] };
        try {
          facts = factsOf(JSON.parse(await readFile(file, "utf8")) as ProjectLike);
        } catch {}
        entry = { mtime: info.mtimeMs, facts };
        cache.set(id, entry);
      }
      result.set(id, { ...entry.facts, updatedAt: info.mtime.toISOString() });
    }),
  );
  return result;
}

async function safe<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}
const newest = <T>(items: T[], at: (item: T) => string) =>
  [...items].sort((a, b) => at(b).localeCompare(at(a)));

export async function studioOverview(viewer: Identity): Promise<StudioData> {
  const registry = await readRegistry();
  const now = new Date().toISOString();
  const [accounts, orders, requests, billing, notifications, domains] =
    await Promise.all([
      safe(listAccounts, []),
      safe(() => listOrders(viewer), []),
      safe(() => listRequests(viewer), []),
      safe(readBilling, null),
      safe(
        () =>
          listNotifications(
            viewer,
            registry.sites.map((site) => site.id),
          ),
        [],
      ),
      // All custom domains live in one document (domains/store.ts): one read for every website.
      safe(
        () =>
          withDoc<DomainsDocument, DomainsDocument["domains"]>(
            "domains",
            () => ({ revision: 0, domains: [], tokens: {} }),
            (doc) => doc.domains ?? [],
            false,
          ),
        [],
      ),
    ]);
  const facts = await safe(
    () => siteFacts(registry.sites.map((site) => site.id)),
    new Map<string, SiteFacts>(),
  );
  const open = orders.filter(
    (order) => order.status !== "live" && order.status !== "cancelled",
  );
  const waiting = requests.filter(
    (request) => request.status === "new" || request.status === "accepted",
  );
  const sites: Record<string, StudioSite> = {};
  for (const site of registry.sites) {
      const own = domains.filter((d) => d.siteId === site.id);
      const domain =
        own.find((d) => d.primary && d.status === "active") ??
        own.find((d) => d.status === "active") ??
        own[0];
      sites[site.id] = {
        ...(domain
          ? { domain: domain.domain, domainLive: domain.status === "active" }
          : {}),
        subscription: billing?.subscriptions.find((s) => s.siteId === site.id)
          ?.status,
        paidUntil: billing?.subscriptions.find((s) => s.siteId === site.id)?.paidUntil,
        plan: (() => {
          const sub = billing?.subscriptions.find((s) => s.siteId === site.id);
          return sub && billing
            ? { kind: sub.plan, price: billing.settings[sub.plan] }
            : undefined;
        })(),
        live: facts.get(site.id)?.live ?? false,
        pages: facts.get(site.id)?.pages ?? 0,
        languages: facts.get(site.id)?.languages ?? [],
        publishedAt: facts.get(site.id)?.publishedAt,
        logo: facts.get(site.id)?.logo,
        color: facts.get(site.id)?.color,
        updatedAt: facts.get(site.id)?.updatedAt ?? site.createdAt,
        openOrders: open.filter((order) => order.siteId === site.id).length,
        openRequests: waiting.filter((request) => request.siteId === site.id).length,
      };
  }
  const unread = notifications.filter((item) => !item.read);
  const unpaid = (billing?.invoices ?? []).filter(
    (invoice) => invoice.status === "open",
  );
  return {
    sites,
    accounts: accounts.map(({ id, name, email, role, disabled, scope }) => ({
      id,
      name,
      email,
      role,
      disabled,
      scope,
    })),
    openOrders: open.length,
    orders: newest(open, (order) => order.updatedAt)
      .slice(0, 5)
      .map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        name:
          order.answers?.business ||
          order.contact?.name ||
          order.contact?.email ||
          "",
        needsAction: order.needsAction,
        updatedAt: order.updatedAt,
        siteId: order.siteId,
      })),
    openRequests: waiting.length,
    requests: newest(waiting, (request) => request.createdAt)
      .slice(0, 5)
      .map(({ id, number, siteId, author, text, status, createdAt }) => ({
        id,
        number,
        siteId,
        author,
        text: text.slice(0, 160),
        status,
        createdAt,
      })),
    history: registry.sites.flatMap((site) =>
      (billing?.invoices ?? [])
        .filter((invoice) => invoice.siteId === site.id)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
        .slice(0, 10)
        .map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          siteId: invoice.siteId,
          description: invoice.description,
          amount: invoice.amount,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          status: invoice.status,
          overdue: invoice.status === "open" && invoice.dueAt < now,
        })),
    ),
    unpaidTotal: unpaid.reduce((sum, invoice) => sum + invoice.amount, 0),
    unpaidCount: unpaid.length,
    overdueCount: unpaid.filter((invoice) => invoice.dueAt < now).length,
    // All open invoices: the client quick view and Client page list them per client.
    invoices: [...unpaid]
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        siteId: invoice.siteId,
        description: invoice.description,
        amount: invoice.amount,
        dueAt: invoice.dueAt,
        overdue: invoice.dueAt < now,
      })),
    unreadNotifications: unread.length,
    notifications: newest(unread, (item) => item.at)
      .slice(0, 5)
      .map(({ id, at, title, text, href, siteId }) => ({
        id,
        at,
        title,
        text,
        href,
        siteId,
      })),
  };
}
