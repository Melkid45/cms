// DNS checks for custom domains, without paid services: DNS-over-HTTPS (Cloudflare 1.1.1.1,
// then Google) so the answer does not depend on this server's resolver cache; node:dns with
// public resolvers as the last fallback. The record logic is pure (records + resolver in,
// verdict out) and is unit-tested with a fake resolver in scripts/test-domains.mjs.
// Only type imports here, so Node can load this file directly in that test.
import type { DnsRecord, DnsType, DomainStatus, ImportRecord } from "./names";

export type Resolver = (name: string, type: DnsType) => Promise<string[]>;
const TYPE_CODE: Record<DnsType, number> = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
const DOH = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];
const clean = (value: string) => value.trim().replace(/\.$/, "").toLowerCase();
// TXT answers come quoted, long values split into several "chunks".
const txt = (value: string) =>
  [...value.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("") || value;

export function dohResolver(fetchImpl: typeof fetch = fetch): Resolver {
  return async (name, type) => {
    let lastError: unknown;
    for (const endpoint of DOH) {
      try {
        const url = `${endpoint}?name=${encodeURIComponent(name)}&type=${type}`;
        const response = await fetchImpl(url, {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(6000),
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`DoH ${response.status}`);
        const data = (await response.json()) as {
          Status: number;
          Answer?: { type: number; data: string }[];
        };
        // 0 = NOERROR, 3 = NXDOMAIN (no such name): both are real answers.
        if (data.Status !== 0 && data.Status !== 3) throw new Error(`DNS status ${data.Status}`);
        return (data.Answer ?? [])
          .filter((a) => a.type === TYPE_CODE[type])
          .map((a) => (type === "TXT" ? txt(a.data) : clean(a.data)));
      } catch (error) {
        lastError = error;
      }
    }
    return systemResolve(name, type, lastError);
  };
}
async function systemResolve(name: string, type: DnsType, cause: unknown): Promise<string[]> {
  try {
    const { Resolver } = await import("node:dns/promises");
    const resolver = new Resolver({ timeout: 5000, tries: 2 });
    resolver.setServers(["1.1.1.1", "8.8.8.8"]);
    if (type === "TXT") return (await resolver.resolveTxt(name)).map((parts) => parts.join(""));
    if (type === "CNAME") return (await resolver.resolveCname(name)).map(clean);
    if (type === "NS") return (await resolver.resolveNs(name)).map(clean);
    if (type === "MX")
      return (await resolver.resolveMx(name)).map((mx) => `${mx.priority} ${clean(mx.exchange)}`);
    return (await (type === "A" ? resolver.resolve4(name) : resolver.resolve6(name))).map(clean);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    throw cause ?? error;
  }
}

// Cloudflare proxy ("orange cloud") answers with Cloudflare's own addresses.
const CLOUDFLARE = [
  "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "188.114.96.0/20", "162.158.0.0/15",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "198.41.128.0/17",
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "131.0.72.0/22", "197.234.240.0/22",
];
const ip4 = (ip: string) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
export function cloudflareIp(ip: string) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  return CLOUDFLARE.some((range) => {
    const [base, bits] = range.split("/");
    const size = 2 ** (32 - Number(bits));
    return Math.floor(ip4(ip) / size) === Math.floor(ip4(base) / size);
  });
}

export interface CheckResult {
  status: DomainStatus;
  records: DnsRecord[];
  error?: string;
  warnings: string[];
  // Routing matched (or is behind the Cloudflare proxy of an already verified domain).
  routed: boolean;
  owned: boolean;
}
// Compares DNS with the expected records. `ownership`: "txt" = our _harbstone-verify record
// must match; a boolean = the hosting provider (Vercel) has already decided.
export async function checkRecords(
  records: DnsRecord[],
  resolve: Resolver,
  options: { ownership: "txt" | boolean; alreadyVerified?: boolean },
): Promise<CheckResult> {
  const warnings: string[] = [];
  const problems: string[] = [];
  const out: DnsRecord[] = [];
  let proxied = false;
  for (const record of records) {
    const expected = clean(record.value);
    let found: string[] = [];
    let ok = false;
    if (record.type === "TXT") {
      found = await resolve(record.host, "TXT");
      ok = found.some((value) => value.trim() === record.value);
      if (!ok && found.length && record.purpose === "ownership")
        problems.push(`The TXT record ${record.name} has a different value. Copy it again.`);
    } else if (record.type === "A") {
      found = await resolve(record.host, "A");
      ok = found.length > 0 && found.every((ip) => ip === expected);
      if (!ok && found.length) {
        if (found.every(cloudflareIp)) proxied = true;
        else if (found.includes(expected))
          problems.push(
            `Remove the other A records of ${record.name}: ${found.filter((ip) => ip !== expected).join(", ")}.`,
          );
        else problems.push(`${record.name} points to ${found.join(", ")} instead of ${record.value}.`);
      }
      if (ok && (await resolve(record.host, "AAAA")).length)
        warnings.push(`Remove the AAAA (IPv6) records of ${record.name}: the hosting answers only on IPv4.`);
    } else if (record.type === "CNAME") {
      found = await resolve(record.host, "CNAME");
      ok = found.includes(expected);
      if (!ok) {
        // Cloudflare "CNAME flattening" or an A record with the hosting address also routes correctly.
        const addresses = await resolve(record.host, "A");
        if (addresses.length && addresses.every(cloudflareIp)) proxied = true;
        else if (found.length)
          problems.push(`${record.name} is a CNAME to ${found.join(", ")} instead of ${record.value}.`);
        if (!found.length) found = addresses;
      }
    }
    out.push({ ...record, ok, found });
  }
  const required = out.filter(
    (r) => r.purpose === "routing" || (r.purpose === "ownership" && options.ownership === "txt"),
  );
  const routing = out.filter((r) => r.purpose === "routing");
  const www = out.find((r) => r.purpose === "www");
  const owned =
    options.ownership === "txt"
      ? out.filter((r) => r.purpose === "ownership").every((r) => r.ok)
      : options.ownership;
  let routed = routing.length > 0 && routing.every((r) => r.ok);
  if (proxied) {
    if (options.alreadyVerified) {
      routed = true;
      warnings.push(
        "The domain goes through the Cloudflare proxy (orange cloud). Keep SSL/TLS mode “Full (strict)”, otherwise visitors get a redirect loop.",
      );
    } else
      problems.push(
        "Cloudflare proxy is on. Set “Proxy status: DNS only” (grey cloud) until the domain is active and the certificate is issued.",
      );
  }
  if (routed && www && !www.ok && !www.found?.length)
    warnings.push(`Add the www record too, so ${www.host} opens the website.`);
  let status: DomainStatus;
  if (routed && owned) status = "active";
  else if (problems.length) status = "error";
  else if (required.some((r) => r.ok) || (options.ownership === true && !routed)) status = "verifying";
  else status = "pending";
  return {
    status,
    records: out,
    error: problems.length ? problems.join(" ") : undefined,
    warnings,
    routed,
    owned,
  };
}

// ------------------------------------------------------------------ nameservers mode
// The domain is delegated to the hosting's DNS when every NS it answers is one of ours.
export function checkNameservers(expected: string[], found: string[]) {
  const want = new Set(expected.map(clean));
  const got = [...new Set(found.map(clean))];
  const ours = got.filter((ns) => want.has(ns));
  return {
    found: got,
    ok: got.length > 0 && ours.length === got.length,
    // Some ours, some old: the registrar kept the old nameservers next to the new ones.
    mixed: ours.length > 0 && ours.length < got.length,
  };
}

// Records worth keeping when the nameservers move: mail (MX, SPF, DMARC, DKIM on common
// selectors), verification TXT records and the usual mail/service subdomains. The website's
// own records (the domain's A, www) are not copied: the hosting creates them.
export const DKIM_SELECTORS = [
  "google", "default", "selector1", "selector2", "k1", "k2", "s1", "s2", "dkim", "mail",
  "zoho", "zmail", "protonmail", "protonmail2", "protonmail3", "mxvault", "sendgrid", "smtp",
];
export const SERVICE_SUBDOMAINS = [
  "mail", "webmail", "smtp", "imap", "pop", "pop3", "autodiscover", "autoconfig", "mx",
  "email", "ftp", "cpanel", "webdisk", "lyncdiscover", "sip", "enterpriseregistration",
  "enterpriseenrollment", "em", "links", "click",
];
export async function scanRecords(domain: string, resolve: Resolver): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];
  const add = (r: Omit<ImportRecord, "id" | "selected" | "state">) => {
    const id = `${r.type}:${r.name}:${r.priority ?? ""}:${r.value}`.slice(0, 300);
    if (!out.some((x) => x.id === id)) out.push({ ...r, id, selected: true, state: "pending" });
  };
  const safe = (name: string, type: DnsType) => resolve(name, type).catch(() => [] as string[]);
  for (const mx of await safe(domain, "MX")) {
    const [priority, host] = mx.split(/\s+/);
    if (host && host !== ".") add({ type: "MX", name: "", value: host, priority: Number(priority) || 10, label: "Email server (MX)" });
  }
  for (const txt of await safe(domain, "TXT")) {
    if (txt.startsWith("harbstone-verify=")) continue;
    add({ type: "TXT", name: "", value: txt, label: /^v=spf1/i.test(txt) ? "SPF (who may send your email)" : "Verification / other TXT" });
  }
  for (const txt of await safe(`_dmarc.${domain}`, "TXT"))
    add({ type: "TXT", name: "_dmarc", value: txt, label: "DMARC (email policy)" });
  await Promise.all(
    DKIM_SELECTORS.map(async (selector) => {
      const name = `${selector}._domainkey`;
      const cname = await safe(`${name}.${domain}`, "CNAME");
      if (cname.length) return add({ type: "CNAME", name, value: cname[0], label: `DKIM (${selector})` });
      for (const txt of await safe(`${name}.${domain}`, "TXT"))
        if (/v=DKIM1|k=rsa|p=/i.test(txt)) add({ type: "TXT", name, value: txt, label: `DKIM (${selector})` });
    }),
  );
  await Promise.all(
    SERVICE_SUBDOMAINS.map(async (sub) => {
      const host = `${sub}.${domain}`;
      const cname = await safe(host, "CNAME");
      if (cname.length) return add({ type: "CNAME", name: sub, value: cname[0], label: `${sub}. subdomain` });
      for (const ip of await safe(host, "A")) add({ type: "A", name: sub, value: ip, label: `${sub}. subdomain` });
    }),
  );
  // Stable order: MX, apex TXT, DMARC, DKIM, subdomains.
  const rank = (r: ImportRecord) =>
    r.type === "MX" ? 0 : r.name === "" ? 1 : r.name === "_dmarc" ? 2 : r.name.endsWith("._domainkey") ? 3 : 4;
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || (a.priority ?? 0) - (b.priority ?? 0));
}
