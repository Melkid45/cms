import { after } from "next/server";
import { z } from "zod";
import {
  clientIp,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { readSiteProject } from "@/lib/builder/products/public";
import { readRegistry } from "@/lib/builder/sites";
import { sessionIdentity } from "@/lib/builder/auth";
import { siteSuspended } from "@/lib/builder/billing";
import {
  contactKinds,
  dayKey,
  funnelSteps,
  rateLimited,
  recordHit,
  scheduleFlush,
  visitorHashes,
  type Hit,
} from "@/lib/builder/analytics";
export const runtime = "nodejs";

// Public tracking beacon of published website pages (see BUILDER.md → Analytics).
// Always answers 204 for accepted or ignored hits, so the beacon reveals nothing.
const text = (max: number) => z.string().max(max).optional();
const schema = z
  .object({
    s: z.string().regex(/^[a-z0-9]{1,40}$/),
    p: z.string().min(1).max(100),
    t: z.enum(["view", "leave", "action", "event", "click", "scroll", "ping"]),
    r: text(500), // document.referrer
    us: text(100), // utm_source / utm_medium / utm_campaign
    um: text(100),
    uc: text(100),
    ms: z.number().int().min(0).max(3_600_000).optional(),
    a: z.enum(contactKinds).optional(),
    e: z.enum(funnelSteps).optional(), // funnel step
    // clicked element: "section id|path inside the section|link or button text"
    k: z
      .string()
      .max(300)
      .regex(/^[\w-]{0,60}\|[a-z0-9>():-]{0,200}\|[^|<>\n]{0,60}$/i)
      .optional(),
    d: z.number().int().min(0).max(100).optional(), // scroll depth, %
    f: z.union([z.literal(0), z.literal(1)]).optional(), // first time report of the view
  })
  .strict();
const bots =
  /bot|crawl|spider|slurp|scrape|fetch|preview|facebookexternalhit|embedly|headless|lighthouse|pagespeed|phantom|selenium|puppeteer|playwright|python|curl|wget|httpclient|okhttp|axios|go-http|java\/|libwww|monitor|uptime|pingdom/i;

// Website + published pages, cached per instance for 30 s so hits do not re-read storage.
const cache = new Map<
  string,
  {
    until: number;
    timeZone: string;
    pages: Set<string>;
    host: string;
    live: boolean;
  }
>();
async function siteInfo(siteId: string) {
  const cached = cache.get(siteId);
  if (cached && cached.until > Date.now()) return cached;
  const exists = (await readRegistry()).sites.some((s) => s.id === siteId);
  let info = {
    until: Date.now() + 30_000,
    timeZone: "UTC",
    pages: new Set<string>(),
    host: "",
    live: false,
  };
  if (exists) {
    // Product pages built from the catalogue count as pages (lib/builder/products).
    const project = await readSiteProject(siteId);
    let host = "";
    try {
      host = new URL(project.website?.url || "").host;
    } catch {}
    info = {
      ...info,
      timeZone: project.website?.timeZone || "UTC",
      host: host.replace(/^www\./, ""),
      pages: new Set(
        project.pages
          .filter((p) => !p.deletedAt && p.status === "Published" && p.published)
          .map((p) => p.id),
      ),
      live: !(await siteSuspended(siteId)),
    };
  }
  if (cache.size > 500) cache.clear();
  cache.set(siteId, info);
  return info;
}
function device(ua: string) {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua))
    return "Tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "Mobile";
  return "Desktop";
}
const clean = (value?: string) =>
  (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ._+\-]/gu, "")
    .trim()
    .slice(0, 60);
// Country only from a header written by the hosting proxy, never from the visitor.
function country(headers: Headers) {
  const value = process.env.VERCEL
    ? headers.get("x-vercel-ip-country")
    : headers.get("cf-ray")
      ? headers.get("cf-ipcountry")
      : null;
  return value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1"
    ? value
    : "Unknown";
}
export async function POST(request: Request) {
  const done = () => new Response(null, { status: 204 });
  try {
    const headers = request.headers;
    const origin = headers.get("origin");
    const host = headers.get("host") || new URL(request.url).host;
    if (origin && new URL(origin).host !== host) return done();
    const ua = headers.get("user-agent") || "";
    if (!ua || ua.length > 512 || bots.test(ua)) return done();
    const purpose = `${headers.get("sec-purpose") || ""} ${headers.get("purpose") || ""}`;
    if (/prefetch|prerender/i.test(purpose)) return done();
    // Signed-in CMS users (owner, team, clients) are not counted.
    const session = request.headers
      .get("cookie")
      ?.split(/;\s*/)
      .find((c) => c.startsWith("cms_session="))
      ?.slice("cms_session=".length);
    if (session && sessionIdentity(decodeURIComponent(session))) return done();
    const ip = clientIp(request);
    if (rateLimited(ip)) return new Response(null, { status: 429 });
    const parsed = schema.safeParse(await readJson(request, 2000));
    if (!parsed.success) return new Response(null, { status: 400 });
    const input = parsed.data;
    const info = await siteInfo(input.s);
    if (!info.live || !info.pages.has(input.p)) return done();
    const day = dayKey(new Date(), info.timeZone);
    const hit: Hit = { site: input.s, day, kind: input.t, page: input.p };
    if (input.t === "view") {
      Object.assign(
        hit,
        await visitorHashes(input.s, day, input.p, ip, ua),
      );
      let refHost = "";
      try {
        const ref = new URL(input.r || "");
        if (/^https?:$/.test(ref.protocol))
          refHost = ref.host.toLowerCase().replace(/^www\./, "");
      } catch {}
      const own = host.toLowerCase().replace(/^www\./, "");
      // A view referred by this website is a page change, not a new visit.
      hit.landing = !refHost || (refHost !== own && refHost !== info.host);
      if (hit.landing) {
        hit.source = refHost || "Direct";
        const utm = [input.us, input.um, input.uc].map(clean);
        if (utm.some(Boolean))
          hit.utm = utm.map((v) => v || "—").join(" / ");
      }
      hit.device = device(ua);
      hit.country = country(headers);
      const lang = (headers.get("accept-language") || "")
        .split(",")[0]
        .split(/[-;]/)[0]
        .trim()
        .toLowerCase();
      hit.language = /^[a-z]{2,3}$/.test(lang) ? lang : "Unknown";
    } else if (input.t === "leave") {
      if (!input.ms || input.ms < 500) return done();
      hit.ms = Math.min(input.ms, 30 * 60_000);
      // Older pages send one leave per view without f: count it as the first report.
      hit.first = input.f !== 0;
    } else if (input.t === "click") {
      if (!input.k) return new Response(null, { status: 400 });
      hit.click = input.k.trim();
    } else if (input.t === "scroll") {
      if (input.d === undefined) return new Response(null, { status: 400 });
      hit.depth = input.d;
    } else {
      if (input.t === "action") {
        if (!input.a) return new Response(null, { status: 400 });
        hit.action = input.a;
      } else if (input.t === "event") {
        if (!input.e) return new Response(null, { status: 400 });
        hit.step = input.e;
      }
      // A ping may carry visible time since the last report (fallback for a lost leave beacon).
      if (input.t === "ping" && input.ms && input.ms >= 500) {
        hit.ms = Math.min(input.ms, 30 * 60_000);
        hit.first = input.f === 1;
      }
      // Actions, funnel steps and pings count once per visitor and day / show in "Live now".
      hit.visitor = (await visitorHashes(input.s, day, input.p, ip, ua)).visitor;
    }
    recordHit(hit);
    after(scheduleFlush);
    return done();
  } catch (error) {
    if (error instanceof StoreError && error.status === 413)
      return new Response(null, { status: 413 });
    console.error("Analytics beacon failed:", error);
    return done();
  }
}
