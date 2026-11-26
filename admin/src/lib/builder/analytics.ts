import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { withDoc } from "./doc-store";
import { database, dataDirectory, readProject } from "./server";
import { listSubmissions } from "./submissions";
import { listShopOrders } from "./shop";
import { readBookings } from "./booking/store";
import { readRegistry } from "./sites";
import { pageHref } from "./i18n";
import { readAnalyticsConfig, type Goal } from "./analytics-config";

// First-party website analytics (see BUILDER.md → Analytics).
// No cookies or browser storage: a visitor is a hash of a random daily salt, the website,
// the IP address and the user agent. Salts are kept only for the current days and the
// per-day hash lists are dropped once the day is over, so no visitor can be followed
// across days. Hits are buffered in memory and written as aggregated counters, one
// locked document per website and month ("analytics:{site}:{yyyy-mm}").

export const contactKinds = [
  "phone",
  "email",
  "whatsapp",
  "telegram",
  "calculator",
] as const;
export type ContactKind = (typeof contactKinds)[number];
type Counts = Record<string, number>;
interface PageDay {
  v: number; // views
  u: number; // unique visitors of this page
  t: number; // visible time, ms
  n: number; // views that reported time
  a: number; // contact actions
}
export interface AnalyticsDay {
  views: number;
  visits: number; // views that started a visit (no referrer from this website)
  visitors: number; // unique visitors of the day
  time: number;
  timed: number;
  actions: Counts;
  pages: Record<string, PageDay>;
  sources: Counts;
  utm: Counts;
  devices: Counts;
  countries: Counts;
  languages: Counts;
  // v2 (all optional, older days lack them):
  steps?: Counts; // unique visitors per funnel step and per contact action ("a:phone", "a:any")
  clicks?: Record<string, Counts>; // per page: "section|path|label" → clicks
  scroll?: Record<string, number[]>; // per page: views that reached 25 / 50 / 75 / 100 %
  seen?: string[];
  seenPages?: string[];
  seenSteps?: string[];
}
interface MonthDoc {
  days: Record<string, AnalyticsDay>;
}
// Funnel steps sent by the beacon (site-analytics.tsx).
export const funnelSteps = [
  "product", // a page with product cards, a product or the configurator was viewed
  "cart", // "Order" button: added to the cart
  "checkout", // the checkout page was opened
  "order", // the order was sent
  "form_start", // first focus in a website form
  "form_sent", // the form was sent
  "booking", // an online booking was made (contact-v60 widget)
] as const;
export type FunnelStep = (typeof funnelSteps)[number];
export const scrollMarks = [25, 50, 75, 100] as const;
export interface Hit {
  site: string;
  day: string; // yyyy-mm-dd in the website's time zone
  kind: "view" | "leave" | "action" | "event" | "click" | "scroll" | "ping";
  page: string;
  step?: FunnelStep;
  click?: string;
  depth?: number;
  first?: boolean; // first time report (leave or ping) of a view: counted in "timed"
  visitor?: string;
  pageVisitor?: string;
  landing?: boolean;
  source?: string;
  utm?: string;
  device?: string;
  country?: string;
  language?: string;
  ms?: number;
  action?: ContactKind;
}

const RETENTION_DAYS = 400;
const MAX_KEYS = 300; // per dimension and day; the rest is counted as "Other"
const MAX_SEEN = 100_000;

const store = globalThis as typeof globalThis & {
  analyticsBuffer?: Hit[];
  analyticsFlush?: Promise<void> | null;
  analyticsSalt?: { day: string; salts: Record<string, string> };
  analyticsLimits?: Map<string, { count: number; until: number }>;
  analyticsPruned?: Record<string, string>;
  analyticsLive?: Map<string, Map<string, { p: string; at: number }>>;
  analyticsLiveDirty?: Set<string>;
};
const LIVE_MS = 5 * 60_000;

export function dayKey(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
const docId = (site: string, month: string) => `analytics:${site}:${month}`;
const shortHash = (value: string) =>
  createHash("sha256").update(value).digest("base64url").slice(0, 12);

// Random salt per calendar day, stored only while that day (± one day for time zones) lasts.
async function saltFor(day: string) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = store.analyticsSalt;
  if (cached?.day === today && cached.salts[day]) return cached.salts[day];
  const salts = await withDoc<{ salts: Record<string, string> }, Record<string, string>>(
    "analytics-salt",
    () => ({ salts: {} }),
    (doc) => {
      const keep = new Set(
        [-1, 0, 1].map((offset) =>
          new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10),
        ),
      );
      for (const key of Object.keys(doc.salts))
        if (!keep.has(key)) delete doc.salts[key];
      if (keep.has(day) && !doc.salts[day])
        doc.salts[day] = randomBytes(32).toString("base64url");
      return { ...doc.salts };
    },
  );
  store.analyticsSalt = { day: today, salts };
  // A day outside the window gets a throwaway salt (never matches anything later).
  return salts[day] || randomBytes(32).toString("base64url");
}
export async function visitorHashes(
  site: string,
  day: string,
  page: string,
  ip: string,
  userAgent: string,
) {
  const visitor = shortHash(
    `${await saltFor(day)}|${site}|${ip}|${userAgent}`,
  );
  return { visitor, pageVisitor: shortHash(`${visitor}|${page}`) };
}

// Per-instance limit: 60 tracking calls a minute per (hashed) address.
export function rateLimited(ip: string) {
  const limits = (store.analyticsLimits ??= new Map());
  const now = Date.now();
  if (limits.size > 5000)
    for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  const key = shortHash("rl|" + ip);
  const entry = limits.get(key);
  if (!entry || entry.until < now) {
    limits.set(key, { count: 1, until: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 60;
}

const emptyDay = (): AnalyticsDay => ({
  views: 0,
  visits: 0,
  visitors: 0,
  time: 0,
  timed: 0,
  actions: {},
  pages: {},
  sources: {},
  utm: {},
  devices: {},
  countries: {},
  languages: {},
});
function bump(counts: Counts, key: string | undefined, by = 1) {
  if (!key) return;
  if (!(key in counts) && Object.keys(counts).length >= MAX_KEYS) key = "Other";
  counts[key] = (counts[key] || 0) + by;
}

// Hash lists as sets, built once per day object during a flush.
const seenSets = new WeakMap<
  AnalyticsDay,
  { site: Set<string>; pages: Set<string>; steps: Set<string> }
>();
function setsOf(day: AnalyticsDay) {
  let sets = seenSets.get(day);
  if (!sets)
    seenSets.set(
      day,
      (sets = {
        site: new Set(day.seen),
        pages: new Set(day.seenPages),
        steps: new Set(day.seenSteps),
      }),
    );
  return sets;
}
// Counts a step once per visitor and day.
function uniqueStep(day: AnalyticsDay, visitor: string | undefined, step: string) {
  if (!visitor) return;
  const key = shortHash(`${visitor}|${step}`);
  const seen = setsOf(day).steps;
  if (seen.has(key)) return;
  if (seen.size < MAX_SEEN) (day.seenSteps ??= []).push(key);
  seen.add(key);
  bump((day.steps ??= {}), step);
}
function apply(day: AnalyticsDay, hit: Hit) {
  if (hit.kind === "ping" && !hit.ms) return;
  if (hit.kind === "event") {
    if (hit.step) uniqueStep(day, hit.visitor, hit.step);
    return;
  }
  if (hit.kind === "click") {
    if (hit.click) bump(((day.clicks ??= {})[hit.page] ??= {}), hit.click);
    return;
  }
  if (hit.kind === "scroll") {
    const marks = ((day.scroll ??= {})[hit.page] ??= [0, 0, 0, 0]);
    scrollMarks.forEach((mark, i) => {
      if ((hit.depth || 0) >= mark) marks[i]++;
    });
    return;
  }
  const page = (day.pages[hit.page] ??= { v: 0, u: 0, t: 0, n: 0, a: 0 });
  if (hit.kind === "view") {
    day.views++;
    page.v++;
    const sets = setsOf(day);
    const seen = sets.site;
    if (hit.visitor && !seen.has(hit.visitor)) {
      day.visitors++;
      if (seen.size < MAX_SEEN) (day.seen ??= []).push(hit.visitor);
      seen.add(hit.visitor);
      bump(day.devices, hit.device);
      bump(day.countries, hit.country);
      bump(day.languages, hit.language);
    }
    const seenPages = sets.pages;
    if (hit.pageVisitor && !seenPages.has(hit.pageVisitor)) {
      page.u++;
      if (seenPages.size < MAX_SEEN) (day.seenPages ??= []).push(hit.pageVisitor);
      seenPages.add(hit.pageVisitor);
    }
    if (hit.landing) {
      day.visits++;
      bump(day.sources, hit.source || "Direct");
      if (hit.utm) bump(day.utm, hit.utm);
    }
  } else if ((hit.kind === "leave" || hit.kind === "ping") && hit.ms) {
    // Time comes in parts (pings + final leave); a view is counted once, on its first part.
    day.time += hit.ms;
    page.t += hit.ms;
    if (hit.first !== false) {
      day.timed++;
      page.n++;
    }
  } else if (hit.kind === "action" && hit.action) {
    bump(day.actions, hit.action);
    page.a++;
    uniqueStep(day, hit.visitor, `a:${hit.action}`);
    uniqueStep(day, hit.visitor, "a:any");
  }
}

// ----------------------------------------------------------------- live now
// Visitors seen in the last 5 minutes: kept in memory and mirrored to "analytics-live:{site}"
// on each flush, so other server instances see them too. Keys are hashes of the daily
// visitor hash; entries older than 5 minutes are dropped.
function markLive(hit: Hit) {
  if (!hit.visitor) return;
  const sites = (store.analyticsLive ??= new Map());
  let visitors = sites.get(hit.site);
  if (!visitors) sites.set(hit.site, (visitors = new Map()));
  visitors.set(shortHash(`live|${hit.visitor}`), { p: hit.page, at: Date.now() });
  (store.analyticsLiveDirty ??= new Set()).add(hit.site);
}
type LiveDoc = { v: Record<string, { p: string; at: number }> };
function pruneLive(entries: Map<string, { p: string; at: number }> | LiveDoc["v"]) {
  const limit = Date.now() - LIVE_MS;
  if (entries instanceof Map) {
    for (const [key, value] of entries) if (value.at < limit) entries.delete(key);
  } else for (const [key, value] of Object.entries(entries)) if (value.at < limit) delete entries[key];
}
async function flushLive() {
  const dirty = [...(store.analyticsLiveDirty ?? [])];
  store.analyticsLiveDirty = new Set();
  for (const site of dirty) {
    const memory = store.analyticsLive?.get(site);
    if (!memory) continue;
    pruneLive(memory);
    await withDoc<LiveDoc, void>(
      `analytics-live:${site}`,
      () => ({ v: {} }),
      (doc) => {
        doc.v ??= {};
        for (const [key, value] of memory)
          if (!doc.v[key] || doc.v[key].at < value.at) doc.v[key] = value;
        pruneLive(doc.v);
      },
    ).catch(() => {});
  }
}
export async function liveNow(siteId: string) {
  const entries = new Map<string, { p: string; at: number }>();
  const doc = await withDoc<LiveDoc, LiveDoc>(
    `analytics-live:${siteId}`,
    () => ({ v: {} }),
    (d) => d,
    false,
  ).catch(() => ({ v: {} }) as LiveDoc);
  for (const [key, value] of Object.entries(doc.v || {})) entries.set(key, value);
  for (const [key, value] of store.analyticsLive?.get(siteId) ?? [])
    if (!entries.has(key) || entries.get(key)!.at < value.at) entries.set(key, value);
  pruneLive(entries);
  const project = await readProject(siteId);
  const titles = new Map(project.pages.map((p) => [p.id, p.title]));
  const pages: Counts = {};
  for (const { p } of entries.values()) pages[p] = (pages[p] || 0) + 1;
  return {
    visitors: entries.size,
    pages: Object.entries(pages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, value]) => ({ id, title: titles.get(id) || "Removed page", value })),
    at: new Date().toISOString(),
  };
}

async function flush() {
  const hits = store.analyticsBuffer ?? [];
  store.analyticsBuffer = [];
  const groups = new Map<string, Hit[]>();
  for (const hit of hits) {
    markLive(hit);
    if (hit.kind === "ping" && !hit.ms) continue;
    const id = docId(hit.site, hit.day.slice(0, 7));
    groups.set(id, [...(groups.get(id) || []), hit]);
  }
  for (const [id, group] of groups) {
    const latest = group.reduce((max, h) => (h.day > max ? h.day : max), "");
    await withDoc<MonthDoc, void>(
      id,
      () => ({ days: {} }),
      (doc) => {
        doc.days ??= {};
        for (const hit of group) apply((doc.days[hit.day] ??= emptyDay()), hit);
        // Visitor hashes are needed only while their day lasts.
        for (const [key, day] of Object.entries(doc.days))
          if (key < latest) {
            delete day.seen;
            delete day.seenPages;
            delete day.seenSteps;
          }
      },
    ).catch((error) => console.error("Analytics write failed:", error));
    await prune(group[0].site, latest).catch(() => {});
  }
  await flushLive();
}
// Buffers a hit; the caller keeps the request alive with after(scheduleFlush) so serverless
// instances finish the write. Hits arriving within 1.5 s share one write per document.
export function recordHit(hit: Hit) {
  (store.analyticsBuffer ??= []).push(hit);
}
export function scheduleFlush() {
  if (store.analyticsFlush) return store.analyticsFlush;
  store.analyticsFlush = new Promise<void>((resolve) => setTimeout(resolve, 1500))
    .then(flush)
    .finally(() => {
      store.analyticsFlush = null;
      if (store.analyticsBuffer?.length) void scheduleFlush();
    });
  return store.analyticsFlush;
}

// Deletes a month document (Postgres row or local file).
async function dropDoc(id: string) {
  const sql = await database();
  if (sql) {
    await sql`DELETE FROM harbstone_project WHERE id=${id}`;
    return;
  }
  const file = path.join(dataDirectory, `${id.replaceAll(":", "-")}.json`);
  // Runs inside the document queue so a pending write cannot recreate the file afterwards.
  await withDoc(id, () => null, () => rm(file, { force: true }), false);
}
function monthsBack(from: string, count: number, start = 0) {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 - start - i, 1));
    return date.toISOString().slice(0, 7);
  });
}
// Retention: month documents whose last day is older than 400 days are removed (once a day).
async function prune(site: string, today: string) {
  const pruned = (store.analyticsPruned ??= {});
  if (pruned[site] === today) return;
  pruned[site] = today;
  const limit = new Date(Date.parse(today) - RETENTION_DAYS * 86_400_000);
  for (const month of monthsBack(today, 6, 13)) {
    const [y, m] = month.split("-").map(Number);
    if (new Date(Date.UTC(y, m, 0)) < limit) await dropDoc(docId(site, month));
  }
}
// "Reset analytics for this site": removes every month document within the retention window.
export async function resetAnalytics(site: string) {
  store.analyticsBuffer = (store.analyticsBuffer ?? []).filter(
    (hit) => hit.site !== site,
  );
  store.analyticsLive?.delete(site);
  await dropDoc(`analytics-live:${site}`);
  const today = new Date().toISOString().slice(0, 7) + "-01";
  for (const month of [...monthsBack(today, 19), ...monthsBack(today, 1, -1)])
    await dropDoc(docId(site, month));
}

// ----------------------------------------------------------------- reading
function addCounts(target: Counts, source: Counts = {}) {
  for (const [key, value] of Object.entries(source))
    target[key] = (target[key] || 0) + value;
}
const ranked = (counts: Counts, limit = 20) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));

export interface Totals {
  views: number;
  visits: number;
  visitors: number;
  enquiries: number;
  orders: number;
  revenue: Counts; // per currency
  actions: number;
  time: number;
  timed: number;
}
const zero = (): Totals => ({
  views: 0,
  visits: 0,
  visitors: 0,
  enquiries: 0,
  orders: 0,
  revenue: {},
  actions: 0,
  time: 0,
  timed: 0,
});

// Day lists of a period and the period before it, in the website's time zone.
function periodDates(timeZone: string, days: number) {
  const today = dayKey(new Date(), timeZone);
  const dates = (offset: number) =>
    Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.parse(today) - (offset + days - 1 - i) * 86_400_000);
      return date.toISOString().slice(0, 10);
    });
  return { current: dates(0), previous: dates(days) };
}
async function storedDays(siteId: string, dates: string[]) {
  const stored: Record<string, AnalyticsDay> = {};
  for (const month of [...new Set(dates.map((d) => d.slice(0, 7)))])
    Object.assign(
      stored,
      (
        await withDoc<MonthDoc, MonthDoc>(
          docId(siteId, month),
          () => ({ days: {} }),
          (doc) => doc,
          false,
        )
      ).days,
    );
  return stored;
}

// Click map of one page: clicks per element ("section|path|label"), plus scroll depth.
export async function clickMap(siteId: string, pageId: string, days: number) {
  const project = await readProject(siteId);
  const { current } = periodDates(project.website?.timeZone || "UTC", days);
  const stored = await storedDays(siteId, current);
  const clicks: Counts = {};
  const scroll = [0, 0, 0, 0];
  let views = 0;
  for (const date of current) {
    const day = stored[date];
    if (!day) continue;
    addCounts(clicks, day.clicks?.[pageId]);
    day.scroll?.[pageId]?.forEach((n, i) => (scroll[i] += n));
    views += day.pages?.[pageId]?.v || 0;
  }
  const total = Object.values(clicks).reduce((a, b) => a + b, 0);
  return {
    views,
    total,
    scroll,
    elements: ranked(clicks, 100).map(({ key, value }) => {
      const [section = "", path = "", label = ""] = key.split("|");
      return { key, section, path, label, value };
    }),
  };
}

export async function analyticsReport(siteId: string, days: number) {
  const project = await readProject(siteId);
  const timeZone = project.website?.timeZone || "UTC";
  const { current, previous } = periodDates(timeZone, days);
  const stored = await storedDays(siteId, [...previous, ...current]);
  const config = await readAnalyticsConfig(siteId).catch(() => null);
  const siteKey = (await readRegistry()).sites.find((s) => s.id === siteId)?.key;
  // Hits still waiting in this instance's buffer are not included (at most a few seconds).
  const enquiriesByDay: Counts = {};
  const enquiriesByPage: Record<string, Counts> = {};
  for (const item of await listSubmissions(siteId)) {
    // Enquiries marked Spam or Test in the inbox are not counted.
    if ((item as { flag?: string }).flag) continue;
    const day = dayKey(new Date(item.createdAt), timeZone);
    enquiriesByDay[day] = (enquiriesByDay[day] || 0) + 1;
    ((enquiriesByPage[item.pageId] ??= {})[day] ??= 0);
    enquiriesByPage[item.pageId][day]++;
  }
  // Shop orders (no online payment): cancelled orders are not counted. An order counts for
  // every page whose products it contains, with the revenue of those products.
  const allOrders = await listShopOrders(siteId).catch(() => []);
  const ordersByDay: Record<string, { n: number; revenue: Counts }> = {};
  const ordersByPage: Record<string, Record<string, { n: number; revenue: Counts }>> = {};
  for (const order of allOrders) {
    if (order.status === "cancelled") continue;
    const day = dayKey(new Date(order.createdAt), timeZone);
    const bucket = (ordersByDay[day] ??= { n: 0, revenue: {} });
    bucket.n++;
    addCounts(bucket.revenue, { [order.currency]: order.total ?? order.subtotal });
    const byPage: Record<string, number> = {};
    for (const item of order.items)
      byPage[item.pageId] = (byPage[item.pageId] || 0) + item.total;
    for (const [pageId, sum] of Object.entries(byPage)) {
      const row = ((ordersByPage[pageId] ??= {})[day] ??= { n: 0, revenue: {} });
      row.n++;
      addCounts(row.revenue, { [order.currency]: sum });
    }
  }
  // Online bookings made on the website (booking widget), by day and by page; cancelled ones
  // are not counted. Bookings entered by the team have no page and are left out.
  const bookingsByDay: Counts = {};
  const bookingsByPage: Record<string, Counts> = {};
  for (const b of (await readBookings(siteId).catch(() => null))?.items || []) {
    if (b.source !== "website" || b.status === "cancelled" || b.test) continue;
    const day = dayKey(new Date(b.createdAt), timeZone);
    bookingsByDay[day] = (bookingsByDay[day] || 0) + 1;
    ((bookingsByPage[b.pageId] ??= {})[day] ??= 0);
    bookingsByPage[b.pageId][day]++;
  }
  const totals = (list: string[]) => {
    const t = zero();
    for (const date of list) {
      const day = stored[date];
      t.enquiries += enquiriesByDay[date] || 0;
      t.orders += ordersByDay[date]?.n || 0;
      addCounts(t.revenue, ordersByDay[date]?.revenue);
      if (!day) continue;
      t.views += day.views;
      t.visits += day.visits;
      t.visitors += day.visitors;
      t.time += day.time;
      t.timed += day.timed;
      t.actions += Object.values(day.actions || {}).reduce((a, b) => a + b, 0);
    }
    return t;
  };
  const sums = {
    actions: {} as Counts,
    sources: {} as Counts,
    utm: {} as Counts,
    devices: {} as Counts,
    countries: {} as Counts,
    languages: {} as Counts,
  };
  type PageRow = PageDay & { enquiries: number; orders: number; revenue: Counts; scroll: number[] };
  const newRow = (): PageRow => ({ v: 0, u: 0, t: 0, n: 0, a: 0, enquiries: 0, orders: 0, revenue: {}, scroll: [0, 0, 0, 0] });
  const pages: Record<string, PageRow> = {};
  // Funnel steps (unique visitors per day, summed) of both periods.
  const steps = (list: string[]) => {
    const s: Counts = {};
    for (const date of list) addCounts(s, stored[date]?.steps);
    return s;
  };
  // Goals: page = unique visitors of the page, action = unique visitors with that contact
  // action, form = enquiries (of a page or all), order = shop orders (of a page or all).
  const goalValue = (goal: Goal, list: string[]) =>
    list.reduce((sum, date) => {
      const day = stored[date];
      if (goal.type === "page") return sum + (day?.pages?.[goal.page || ""]?.u || 0);
      if (goal.type === "action") return sum + (day?.steps?.[`a:${goal.action || "any"}`] || 0);
      if (goal.type === "form")
        return sum + (goal.page ? enquiriesByPage[goal.page]?.[date] || 0 : enquiriesByDay[date] || 0);
      if (goal.type === "booking")
        return sum + (goal.page ? bookingsByPage[goal.page]?.[date] || 0 : bookingsByDay[date] || 0);
      return sum + (goal.page ? ordersByPage[goal.page]?.[date]?.n || 0 : ordersByDay[date]?.n || 0);
    }, 0);
  for (const date of current) {
    const day = stored[date];
    for (const [id, marks] of Object.entries(day?.scroll || {}))
      marks.forEach((n, i) => ((pages[id] ??= newRow()).scroll[i] += n));
    for (const [id, counts] of Object.entries(enquiriesByPage))
      if (counts[date]) (pages[id] ??= newRow()).enquiries += counts[date];
    for (const [id, counts] of Object.entries(ordersByPage))
      if (counts[date]) {
        const row = (pages[id] ??= newRow());
        row.orders += counts[date].n;
        addCounts(row.revenue, counts[date].revenue);
      }
    if (!day) continue;
    for (const key of Object.keys(sums) as (keyof typeof sums)[])
      addCounts(sums[key], day[key]);
    for (const [id, page] of Object.entries(day.pages || {})) {
      const row = (pages[id] ??= newRow());
      row.v += page.v;
      row.u += page.u;
      row.t += page.t;
      row.n += page.n;
      row.a += page.a;
    }
  }
  const pageInfo = new Map(project.pages.map((p) => [p.id, p]));
  const currentTotals = totals(current);
  const previousTotals = totals(previous);
  return {
    funnel: { current: steps(current), previous: steps(previous) },
    goals: (config?.goals || []).map((goal) => {
      const value = goalValue(goal, current);
      const prev = goalValue(goal, previous);
      return {
        ...goal,
        pageTitle: goal.page ? pageInfo.get(goal.page)?.title || "Removed page" : "",
        value,
        prev,
        conversion: currentTotals.visitors ? (value / currentTotals.visitors) * 100 : 0,
        prevConversion: previousTotals.visitors ? (prev / previousTotals.visitors) * 100 : 0,
      };
    }),
    weekly: config?.weekly || { email: false, telegram: false },
    pageList: project.pages
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        id: p.id,
        title: p.title,
        href: p.status === "Published" && p.published ? pageHref(project, siteKey, p) : "",
      })),
    days,
    timeZone,
    from: current[0],
    to: current.at(-1)!,
    collecting: Object.keys(stored).length > 0,
    // Shop tiles are shown only for websites that have ever received an order.
    shop: allOrders.length > 0,
    series: current.map((date) => {
      const day = stored[date];
      return {
        date,
        visitors: day?.visitors || 0,
        views: day?.views || 0,
        enquiries: enquiriesByDay[date] || 0,
        orders: ordersByDay[date]?.n || 0,
        actions: Object.values(day?.actions || {}).reduce((a, b) => a + b, 0),
      };
    }),
    totals: currentTotals,
    previous: previousTotals,
    actions: contactKinds.map((kind) => ({ key: kind, value: sums.actions[kind] || 0 })),
    pages: Object.entries(pages)
      .map(([id, row]) => {
        const page = pageInfo.get(id);
        return {
          id,
          title: page ? page.title : "Removed page",
          slug: page && !page.deletedAt ? page.slug : "",
          views: row.v,
          visitors: row.u,
          time: row.t,
          timed: row.n,
          actions: row.a,
          enquiries: row.enquiries,
          orders: row.orders,
          revenue: row.revenue,
          scroll: row.scroll,
        };
      })
      .sort((a, b) => b.views - a.views || b.enquiries + b.orders - a.enquiries - a.orders)
      .slice(0, 50),
    sources: ranked(sums.sources),
    utm: ranked(sums.utm),
    devices: ranked(sums.devices),
    countries: ranked(sums.countries),
    languages: ranked(sums.languages),
  };
}
export type AnalyticsReport = Awaited<ReturnType<typeof analyticsReport>>;
