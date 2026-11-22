import "server-only";
import { analyticsReport } from "./analytics";
import { readAnalyticsConfig, updateAnalyticsConfig } from "./analytics-config";
import { readProject } from "./server";
import { readRegistry } from "./sites";
import { mailConnection } from "./smtp";
import { sendTelegram, telegramStatus } from "./crm/telegram";

// Weekly analytics report (BUILDER.md → Analytics → Weekly report): last 7 days against the
// 7 days before, built on the server from the same numbers as the dashboard.
// Delivery is opt-in per website (Analytics → Weekly report): e-mail to the form recipient
// through the website's SMTP, and Telegram through the website's CRM Telegram bot
// (lib/builder/crm/telegram.ts, CRM → Telegram notifications). Other modules may add channels
// with registerWeeklyReportChannel. Without a configured channel nothing is sent.

export interface WeeklyReport {
  siteId: string;
  siteName: string;
  from: string;
  to: string;
  subject: string;
  rows: { label: string; value: string; change: string }[];
  topPages: { title: string; views: number; visitors: number }[];
  goals: { name: string; value: number; change: string }[];
  text: string;
}

export type WeeklyChannel = {
  name: string;
  // Returns "sent", "skipped" (not configured for this website) or throws.
  send: (siteId: string, report: WeeklyReport) => Promise<"sent" | "skipped">;
};
const registry = globalThis as typeof globalThis & { weeklyChannels?: WeeklyChannel[] };
// Other modules (e.g. site Telegram notifications) register a channel once at import time.
export function registerWeeklyReportChannel(channel: WeeklyChannel) {
  const list = (registry.weeklyChannels ??= []);
  const index = list.findIndex((c) => c.name === channel.name);
  if (index >= 0) list[index] = channel;
  else list.push(channel);
}
// Built-in Telegram channel: the website's CRM Telegram bot, when connected.
const telegramChannel: WeeklyChannel = {
  name: "telegram",
  send: async (siteId, report) => {
    if (!(await telegramStatus(siteId)).connected) return "skipped";
    // "test" = send regardless of the enquiry/order/task switches (the weekly switch is ours).
    await sendTelegram(siteId, "test", report.text);
    return "sent";
  },
};
export const weeklyChannels = () => [telegramChannel, ...(registry.weeklyChannels ?? []).filter((c) => c.name !== "telegram")];
export const telegramReady = (siteId: string) =>
  telegramStatus(siteId)
    .then((s) => s.connected)
    .catch(() => false);

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
function change(cur: number, prev: number) {
  if (!cur && !prev) return "—";
  if (!prev) return "new";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
}
const pp = (cur: number, prev: number) => {
  const diff = cur - prev;
  return `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pp`;
};
const money = (revenue: Record<string, number>) =>
  Object.entries(revenue)
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${c}`)
    .join(" + ") || "0";
const shortDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function buildWeeklyReport(siteId: string): Promise<WeeklyReport> {
  const report = await analyticsReport(siteId, 7);
  const site = (await readRegistry()).sites.find((s) => s.id === siteId);
  const siteName = site?.name || siteId;
  const t = report.totals;
  const p = report.previous;
  const conv = (x: { enquiries: number; visitors: number }) => (x.visitors ? (x.enquiries / x.visitors) * 100 : 0);
  const mainRevenue = (r: Record<string, number>) => Math.max(0, ...Object.values(r));
  const rows = [
    { label: "Visitors", value: fmt(t.visitors), change: change(t.visitors, p.visitors) },
    { label: "Page views", value: fmt(t.views), change: change(t.views, p.views) },
    { label: "Enquiries", value: fmt(t.enquiries), change: change(t.enquiries, p.enquiries) },
    { label: "Enquiry conversion", value: `${fmt(conv(t))}%`, change: pp(conv(t), conv(p)) },
    { label: "Contact actions", value: fmt(t.actions), change: change(t.actions, p.actions) },
    ...(report.shop
      ? [
          { label: "Orders", value: fmt(t.orders), change: change(t.orders, p.orders) },
          { label: "Revenue", value: money(t.revenue), change: change(mainRevenue(t.revenue), mainRevenue(p.revenue)) },
        ]
      : []),
  ];
  const topPages = report.pages
    .filter((page) => page.views > 0)
    .slice(0, 5)
    .map((page) => ({ title: page.title, views: page.views, visitors: page.visitors }));
  const goals = report.goals.map((g) => ({ name: g.name, value: g.value, change: change(g.value, g.prev) }));
  const period = `${shortDate(report.from)} – ${shortDate(report.to)}`;
  const subject = `${siteName.replace(/[\r\n]/g, " ").slice(0, 80)}: weekly report ${period}`;
  const text = [
    `${siteName} — week ${period} (vs the 7 days before)`,
    "",
    ...rows.map((r) => `${r.label}: ${r.value} (${r.change})`),
    "",
    "Top pages:",
    ...(topPages.length ? topPages.map((x, i) => `${i + 1}. ${x.title} — ${fmt(x.views)} views, ${fmt(x.visitors)} visitors`) : ["No page views this week."]),
    ...(goals.length ? ["", "Goals:", ...goals.map((g) => `${g.name}: ${fmt(g.value)} (${g.change})`)] : []),
    "",
    "Website statistics of the CMS: no cookies, no personal data.",
  ].join("\n");
  return { siteId, siteName, from: report.from, to: report.to, subject, rows, topPages, goals, text };
}

// Delivers the report on every channel enabled for the website. No channel → no-op.
export async function sendWeeklyReport(siteId: string) {
  const config = await readAnalyticsConfig(siteId);
  const results: Record<string, string> = {};
  if (!config.weekly.email && !config.weekly.telegram) return results;
  const report = await buildWeeklyReport(siteId);
  if (config.weekly.email) {
    const project = await readProject(siteId);
    const recipient = project.forms?.recipient || "";
    let connection: Awaited<ReturnType<typeof mailConnection>> = null;
    try {
      connection = recipient ? await mailConnection(siteId) : null;
      if (!connection) results.email = "skipped";
      else {
        await connection.transport.sendMail({
          from: connection.from,
          to: recipient,
          subject: report.subject,
          text: report.text,
        });
        results.email = "sent";
      }
    } catch {
      results.email = "failed";
    } finally {
      connection?.transport.close();
    }
  }
  if (config.weekly.telegram) {
    const channels = weeklyChannels().filter((c) => /telegram/i.test(c.name));
    for (const channel of channels)
      results[channel.name] = await channel.send(siteId, report).catch(() => "failed" as const);
  }
  const today = new Date().toISOString().slice(0, 10);
  await updateAnalyticsConfig(siteId, (doc) => {
    doc.weekly.lastSent = today;
    doc.weekly.lastResult = Object.entries(results)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  });
  return results;
}
