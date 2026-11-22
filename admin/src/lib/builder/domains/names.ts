// Custom domains (Settings → Domain): shared types, domain-name validation and the
// "rooted" link form used on a website's own domain. Client-safe (no server imports).
// Only type imports: scripts/test-domains.mjs loads this file directly with Node.
import type { Project } from "../types";

export type DomainStatus = "pending" | "verifying" | "active" | "error";
export type DnsType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS";
export interface DnsRecord {
  type: DnsType;
  // Name as typed at the registrar: "@" (the domain itself), "www", "_harbstone-verify", "shop".
  name: string;
  // Full host name the record lives at.
  host: string;
  value: string;
  // routing = points the domain to the hosting; ownership = proves the domain is the client's.
  purpose: "routing" | "www" | "ownership";
  // Result of the last check: matched, and what DNS actually answered.
  ok?: boolean;
  found?: string[];
}
export interface DomainRecord {
  domain: string;
  siteId: string;
  // Public key of the website (/site/{key}); keys never change, the proxy rewrites to it.
  siteKey: string;
  primary: boolean;
  status: DomainStatus;
  provider: "local" | "vercel";
  records: DnsRecord[];
  createdAt: string;
  checkedAt?: string;
  // Set once ownership and routing matched; the domain is served from then on.
  verifiedAt?: string;
  error?: string;
  // Hints that do not block activation (e.g. www missing).
  warnings?: string[];
  // Main mode ("one step"): the client replaces the domain's nameservers with these (Vercel DNS).
  // Empty for subdomains: they can only use the manual records.
  nameservers?: string[];
  // What the domain's NS answered at the last check.
  foundNameservers?: string[];
  // Email and other records copied from the old DNS into Vercel DNS before the switch.
  imports?: ImportRecord[];
  // Connected through the client's Cloudflare API token (sealed; never sent to the browser).
  cloudflare?: { zoneId: string; token: string; at: string };
}
// A record found on the domain before the switch (mail, SPF, DKIM, subdomains).
export interface ImportRecord {
  id: string;
  type: "A" | "CNAME" | "MX" | "TXT";
  // Relative to the domain: "" = the domain itself, "mail", "google._domainkey".
  name: string;
  value: string;
  priority?: number;
  // Human label: "Email server (MX)", "SPF", "DKIM (google)", "mail. subdomain" …
  label: string;
  selected: boolean;
  // copied = created in Vercel DNS; preview = test mode (no hosting token), would be copied.
  state: "pending" | "copied" | "preview" | "failed";
  hostId?: string;
  error?: string;
}
export interface DomainsDocument {
  revision: number;
  domains: DomainRecord[];
  // Ownership token per website: TXT _harbstone-verify.<domain> = harbstone-verify=<token>.
  tokens: Record<string, string>;
}
// What the dashboard receives (no sealed token).
export type DomainView = Omit<DomainRecord, "cloudflare"> & { cloudflare: boolean };

// Set by src/proxy.ts on requests that came in on a connected domain (incoming copies are removed).
export const DOMAIN_HEADER = "x-harbstone-domain";
export const SITE_HEADER = "x-harbstone-site";
export const VERIFY_LABEL = "_harbstone-verify";
export const verifyValue = (token: string) => `harbstone-verify=${token}`;

// Two-label public suffixes where the registrable domain has three labels (zcena.co.uk).
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "com.au", "net.au", "org.au", "co.nz",
  "com.br", "com.tr", "co.jp", "co.za", "com.ua", "org.ua", "com.pl", "com.mx", "co.il",
  "com.cn", "com.sg", "com.hk", "co.in", "com.ar", "co.kr", "com.my", "com.ru", "org.ru",
]);
// Apex = the registered domain itself (needs A/ALIAS); anything deeper is a subdomain (CNAME).
export function isApex(domain: string) {
  const labels = domain.split(".");
  if (labels.length === 2) return true;
  return labels.length === 3 && SECOND_LEVEL.has(labels.slice(1).join("."));
}

// The zone the client manages at the registrar: shop.zcena.com → zcena.com.
export function registrable(domain: string) {
  const labels = domain.split(".");
  const take = labels.length >= 3 && SECOND_LEVEL.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-take).join(".");
}
// Record name relative to the zone, as registrars expect it ("@", "www", "_harbstone-verify.shop").
export function relativeName(host: string, zone: string) {
  return host === zone ? "@" : host.slice(0, -(zone.length + 1));
}

// Validates what a client typed and returns the ASCII (punycode) host name, lower case,
// without scheme, path, port or a leading "www." (www is attached automatically).
export function normalizeDomain(input: string): { domain: string } | { error: string } {
  let value = input.trim().toLowerCase();
  if (!value) return { error: "Enter your domain, for example zcena.com." };
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(value) || /[/?#@\s:\\]/.test(value))
    return { error: "Enter only the domain name, without https://, slashes or a port." };
  value = value.replace(/\.$/, "");
  let ascii: string;
  try {
    // WHATWG URL parsing gives the IDNA/punycode form (rīga.lv → xn--rga-...); same in Node and browsers.
    ascii = new URL(`http://${value}/`).hostname;
  } catch {
    return { error: "This is not a valid domain name." };
  }
  if (ascii.startsWith("www.") && ascii.split(".").length > 2) ascii = ascii.slice(4);
  const labels = ascii.split(".");
  if (
    ascii.length > 253 ||
    labels.length < 2 ||
    labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ||
    !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels.at(-1)!)
  )
    return { error: "This is not a valid domain name." };
  if (/^\d+$/.test(labels.at(-1)!)) return { error: "Enter a domain name, not an IP address." };
  if (isAdminHost(ascii)) return { error: "This address belongs to the hosting and cannot be connected." };
  return { domain: ascii };
}

// Hosts of the CMS itself (admin, preview tunnels, local): they never resolve to a client
// domain and keep the /site/{key}/… addresses. Extra admin hosts: CMS_HOSTS (comma list).
export function isAdminHost(host: string, extra: string[] = []) {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return (
    !name ||
    name === "localhost" ||
    name.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ||
    name.includes(":") || // IPv6 literal
    name.endsWith(".trycloudflare.com") ||
    name.endsWith(".vercel.app") ||
    name.endsWith(".ts.net") ||
    extra.includes(name)
  );
}

// Same rule as pagePrefix() in i18n.ts: pages of the default language have no locale prefix.
function defaultLanguage(project: Pick<Project, "languages">, locale: string) {
  const l = project.languages;
  return !(l && l.enabled.length > 1 && locale !== l.default && l.enabled.includes(locale));
}
// On the website's own domain links drop the /site/{key} prefix: /site/zcena/ru/katalog →
// /ru/katalog, and the home page of the default language becomes "/".
export function rootedHref(
  project: Pick<Project, "pages" | "layout" | "languages">,
  siteKey: string,
  href: string,
) {
  const prefix = `/site/${siteKey}`;
  // Legacy one-segment links of the first website (/site/{slug}, BUILDER.md → Companies).
  const legacy = /^\/site\/([a-z0-9-]+)([?#].*)?$/.exec(href);
  if (legacy && legacy[1] !== siteKey && project.pages.some((p) => p.slug === legacy[1]))
    return rootedHref(project, siteKey, `${prefix}/${legacy[1]}${legacy[2] ?? ""}`);
  if (!href.startsWith(prefix)) return href;
  const rest = href.slice(prefix.length);
  // /site/zcena-old is another website, not a path of /site/zcena.
  if (rest && !/^[/?#]/.test(rest)) return href;
  const [path, suffix = ""] = /^([^?#]*)(.*)$/.exec(rest)!.slice(1);
  const home = project.pages.find((p) => p.id === project.layout.homePageId);
  if (
    !path ||
    path === "/" ||
    (home && defaultLanguage(project, home.locale) && path === `/${home.slug}`)
  )
    return "/" + suffix;
  return path + suffix;
}
