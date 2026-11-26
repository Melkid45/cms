import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DOMAIN_HEADER, isAdminHost, SITE_HEADER } from "@/lib/builder/domains/names";
import { matchHost } from "@/lib/builder/domains/lookup";

// Custom domains (Next 16 "proxy", formerly middleware; BUILDER.md → Custom domains).
// CMS hosts (127.0.0.1, localhost, IPs, *.trycloudflare.com, *.vercel.app, NEXT_PUBLIC_SITE_URL,
// CMS_HOSTS) pass through untouched: admin and /site/{key}/… work as before.
// A connected domain serves its website at the root: zcena.com/ru/katalogs → /site/zcena/ru/katalogs.

const hostOf = (value: string | null | undefined) => {
  try {
    return value ? new URL(value).host.toLowerCase() : "";
  } catch {
    return "";
  }
};
const extraHosts = [
  hostOf(process.env.NEXT_PUBLIC_SITE_URL),
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ...(process.env.CMS_HOSTS || "").split(","),
]
  .map((h) => (h || "").trim().toLowerCase().replace(/:\d+$/, ""))
  .filter(Boolean);

// Public API used by website pages (forms, shop, booking, media, CSS, analytics, OG images).
// Everything else under /api (the admin API) does not exist on a client domain.
const PUBLIC_API = [
  "/api/forms",
  "/api/shop/",
  "/api/booking",
  "/api/site-css/",
  "/api/seo/og/",
  "/api/social/image",
  "/api/builder/track",
];
// Next runs the proxy again for the rewritten path; this mark (secret-derived, never sent to
// browsers) tells our own rewrite apart from a client that sends the headers itself.
const MARK_HEADER = "x-harbstone-proxy";
const globalMark = globalThis as typeof globalThis & { harbstoneProxySeed?: string };
const MARK = createHash("sha256")
  .update(
    "harbstone-proxy:" +
      (process.env.CMS_AUTH_SECRET || (globalMark.harbstoneProxySeed ??= randomBytes(16).toString("hex"))),
  )
  .digest("hex")
  .slice(0, 32);
const SITE_FILES = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/indexnow.txt"]);
const notFound = (text = "Not found") =>
  new NextResponse(text, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  // Second pass over our own rewrite: leave it alone.
  if (request.headers.get(MARK_HEADER) === MARK) return NextResponse.next();
  const spoofed =
    request.headers.has(DOMAIN_HEADER) ||
    request.headers.has(SITE_HEADER) ||
    request.headers.has(MARK_HEADER);
  const clean = () => {
    const headers = new Headers(request.headers);
    headers.delete(DOMAIN_HEADER);
    headers.delete(SITE_HEADER);
    headers.delete(MARK_HEADER);
    return headers;
  };
  if (isAdminHost(host, extraHosts))
    return spoofed ? NextResponse.next({ request: { headers: clean() } }) : NextResponse.next();

  let match;
  try {
    match = await matchHost(host);
  } catch {
    // Storage unreachable: behave as before custom domains existed.
    return NextResponse.next({ request: { headers: clean() } });
  }
  // No domain was ever added on this installation: unchanged behaviour (safe roll-out).
  if (match.kind === "none") return NextResponse.next({ request: { headers: clean() } });
  if (match.kind === "unknown") return notFound();
  if (match.kind === "pending") return notFound("This domain is being connected to a website.");
  const { pathname, search } = request.nextUrl;
  if (match.kind === "redirect")
    return NextResponse.redirect(`https://${match.domain}${pathname}${search}`, 308);

  const key = match.siteKey;
  if (pathname.startsWith("/_next/")) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    const media = pathname.startsWith("/api/builder/media/") && ["GET", "HEAD"].includes(request.method);
    return media || PUBLIC_API.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))
      ? NextResponse.next({ request: { headers: clean() } })
      : notFound();
  }
  // Old /site/{key}/… links on the domain: drop the prefix (permanent).
  if (pathname === `/site/${key}` || pathname.startsWith(`/site/${key}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(`/site/${key}`.length) || "/";
    return NextResponse.redirect(url, 308);
  }
  // Other websites are never reachable through this domain.
  if (pathname.startsWith("/site/")) return notFound();
  // Static files of the CMS (library images, fonts, icons).
  if (!SITE_FILES.has(pathname) && /\/[^/]+\.[a-z0-9]{2,5}$/i.test(pathname)) return NextResponse.next();
  const headers = clean();
  headers.set(DOMAIN_HEADER, match.domain);
  headers.set(SITE_HEADER, key);
  headers.set(MARK_HEADER, MARK);
  const url = request.nextUrl.clone();
  // Admin pages (/dashboard, /login, …) become paths of the website: its 404.
  url.pathname = `/site/${key}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
