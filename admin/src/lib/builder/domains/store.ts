import "server-only";
import { randomBytes } from "node:crypto";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import { seal, unseal } from "../social/accounts";
import type { Site } from "../sites";
import { checkNameservers, checkRecords, dohResolver, scanRecords, type Resolver } from "./dns";
import { cloudflareConnect } from "./cloudflare";
import { hostingProvider } from "./providers";
import {
  isApex,
  normalizeDomain,
  registrable,
  relativeName,
  VERIFY_LABEL,
  verifyValue,
  type DnsRecord,
  type DomainRecord,
  type DomainsDocument,
  type DomainView,
  type ImportRecord,
} from "./names";

// All custom domains of the installation live in ONE document ("domains" row in
// harbstone_project / .data/domains.json): uniqueness across websites is checked inside its
// lock, and the proxy (src/proxy.ts → domains/lookup.ts) resolves a Host with one read.
const DOC = "domains";
const empty = (): DomainsDocument => ({ revision: 0, domains: [], tokens: {} });
const store = <T>(fn: (doc: DomainsDocument) => T | Promise<T>, write = true) =>
  withDoc<DomainsDocument, T>(
    DOC,
    empty,
    async (doc) => {
      doc.tokens ??= {};
      doc.domains ??= [];
      const result = await fn(doc);
      if (write) {
        doc.revision = (doc.revision || 0) + 1;
        primaryCache.clear();
      }
      return result;
    },
    write,
  );
export const MAX_DOMAINS_PER_SITE = 5;

const view = (record: DomainRecord): DomainView => {
  const { cloudflare, ...rest } = record;
  return { ...rest, cloudflare: !!cloudflare };
};
export async function listDomains(siteId: string) {
  return store(
    (doc) => ({
      domains: doc.domains.filter((d) => d.siteId === siteId).map(view),
      token: doc.tokens[siteId] || null,
    }),
    false,
  );
}

// Records the client creates at the registrar: routing (A on the apex / CNAME on a subdomain),
// www (CNAME, apex only) and the ownership TXT. On Vercel, its TXT challenge replaces ours.
async function expectedRecords(domain: string, token: string): Promise<DnsRecord[]> {
  const provider = hostingProvider();
  const routing = await provider.routing(domain);
  const zone = registrable(domain);
  const record = (r: Omit<DnsRecord, "name">): DnsRecord => ({ ...r, name: relativeName(r.host, zone) });
  const records: DnsRecord[] = isApex(domain)
    ? [
        record({ type: "A", host: domain, value: routing.a, purpose: "routing" }),
        record({ type: "CNAME", host: `www.${domain}`, value: routing.cname, purpose: "www" }),
      ]
    : [record({ type: "CNAME", host: domain, value: routing.cname, purpose: "routing" })];
  if (provider.id === "local")
    records.push(
      record({ type: "TXT", host: `${VERIFY_LABEL}.${domain}`, value: verifyValue(token), purpose: "ownership" }),
    );
  return records;
}

export async function addDomain(site: Site, input: string, resolve: Resolver = dohResolver()) {
  const parsed = normalizeDomain(input);
  if ("error" in parsed) throw new StoreError(parsed.error);
  const { domain } = parsed;
  const provider = hostingProvider();
  // Quick checks before calling the hosting (re-checked under the lock below).
  await store((doc) => {
    const owner = doc.domains.find((d) => d.domain === domain);
    if (owner && owner.siteId !== site.id)
      throw new StoreError("This domain is already connected to another website.", 409);
    if (owner) throw new StoreError("This domain is already in the list.", 409);
  }, false);
  const token =
    (await store((doc) => doc.tokens[site.id], false)) || randomBytes(12).toString("hex");
  await provider.attach(domain);
  const records = await expectedRecords(domain, token);
  // Main mode for a registered domain: switch its nameservers to the hosting. Before that we
  // read what the domain has now (mail, SPF, DKIM, subdomains) to copy it over.
  const apex = isApex(domain);
  const nameservers = apex ? await provider.nameservers(domain) : [];
  const imports = apex ? await scanRecords(domain, resolve).catch(() => []) : [];
  const record = await store((doc) => {
    if (doc.domains.some((d) => d.domain === domain))
      throw new StoreError("This domain is already connected to a website.", 409);
    const own = doc.domains.filter((d) => d.siteId === site.id);
    if (own.length >= MAX_DOMAINS_PER_SITE)
      throw new StoreError(`A website can have up to ${MAX_DOMAINS_PER_SITE} domains.`);
    doc.tokens[site.id] ??= token;
    const created: DomainRecord = {
      domain,
      siteId: site.id,
      siteKey: site.key,
      primary: !own.some((d) => d.primary),
      status: "pending",
      provider: provider.id,
      records,
      nameservers,
      imports,
      createdAt: new Date().toISOString(),
    };
    doc.domains.push(created);
    return created;
  });
  if (imports.length) return syncImports(site.id, domain);
  return view(record);
}

// Creates the selected copied records in the hosting's DNS zone and removes deselected ones.
// Test mode (no hosting token): only marks them "preview" — what would be copied.
async function syncImports(siteId: string, domain: string) {
  const provider = hostingProvider();
  const imports = await store((doc) => structuredClone(owned(doc, siteId, domain).imports ?? []), false);
  for (const item of imports) {
    try {
      if (!provider.live) {
        item.state = item.selected ? "preview" : "pending";
        continue;
      }
      if (item.selected && item.state !== "copied") {
        item.hostId = await provider.createRecord(domain, item);
        item.state = "copied";
        item.error = undefined;
      } else if (!item.selected && item.state === "copied" && item.hostId) {
        await provider.deleteRecord(domain, item.hostId);
        item.state = "pending";
        item.hostId = undefined;
      }
    } catch (error) {
      item.state = "failed";
      item.error = error instanceof Error ? error.message : "Could not copy this record.";
    }
  }
  return store((doc) => {
    const record = owned(doc, siteId, domain);
    record.imports = imports;
    return view(record);
  });
}
// Ticks in the list "We will move N records of your email".
export async function setImports(siteId: string, domain: string, selected: string[]) {
  await store((doc) => {
    for (const item of owned(doc, siteId, domain).imports ?? []) item.selected = selected.includes(item.id);
  });
  return syncImports(siteId, domain);
}
// Reads the domain's current records again (only useful before the nameservers are switched).
export async function rescanImports(siteId: string, domain: string, resolve: Resolver = dohResolver()) {
  const found = await scanRecords(domain, resolve);
  await store((doc) => {
    const record = owned(doc, siteId, domain);
    const before = new Map((record.imports ?? []).map((i) => [i.id, i]));
    record.imports = [
      ...found.map((item): ImportRecord => before.get(item.id) ?? item),
      // Keep records already copied even if the old DNS no longer shows them.
      ...(record.imports ?? []).filter((i) => i.state === "copied" && !found.some((f) => f.id === i.id)),
    ];
  });
  return syncImports(siteId, domain);
}

function owned(doc: DomainsDocument, siteId: string, domain: string) {
  const record = doc.domains.find((d) => d.domain === domain && d.siteId === siteId);
  if (!record) throw new StoreError("Domain not found.", 404);
  return record;
}

// Re-reads DNS (and the hosting state on Vercel) and stores the verdict. The network work
// happens outside the document lock.
export async function checkDomain(siteId: string, domain: string, resolve: Resolver = dohResolver()) {
  const current = await store((doc) => structuredClone(owned(doc, siteId, domain)), false);
  const token = await store((doc) => doc.tokens[siteId] || "", false);
  const provider = hostingProvider();
  let records = current.records;
  let nameservers = current.nameservers ?? [];
  let providerState = null as Awaited<ReturnType<typeof provider.state>>;
  let providerError: string | undefined;
  try {
    // Expected values can change (e.g. Vercel's recommended address): refresh them.
    records = await expectedRecords(domain, token);
    if (nameservers.length) nameservers = await provider.nameservers(domain);
    providerState = await provider.state(domain);
    if (providerState?.verification.length) {
      const zone = registrable(domain);
      records = [
        ...records,
        ...providerState.verification.map(
          (v): DnsRecord => ({
            type: "TXT",
            host: v.host,
            name: relativeName(v.host, zone),
            value: v.value,
            purpose: "ownership",
          }),
        ),
      ];
    }
    providerError = providerState?.error;
  } catch (error) {
    providerError = error instanceof Error ? error.message : "Hosting check failed.";
  }
  let result;
  try {
    result = await checkRecords(records, resolve, {
      ownership: providerState ? providerState.verified : "txt",
      alreadyVerified: !!current.verifiedAt,
    });
  } catch {
    result = {
      status: current.status,
      records,
      error: "DNS could not be checked right now. Try again in a minute.",
      warnings: [],
      routed: false,
      owned: false,
    };
  }
  // Nameservers mode: delegated to the hosting = ownership proven and records set by the hosting.
  let ns = { found: [] as string[], ok: false, mixed: false };
  if (nameservers.length)
    try {
      ns = checkNameservers(nameservers, await resolve(domain, "NS"));
    } catch {}
  let status = result.status;
  let error = result.error || providerError;
  const manualStarted = result.records.some((r) => r.ok && r.purpose !== "www");
  if (nameservers.length && result.status !== "active") {
    if (ns.ok) {
      status = providerState && !providerState.verified ? "verifying" : "active";
      error = providerState && !providerState.verified ? providerError : undefined;
      result.warnings = [];
    } else if (ns.mixed) {
      status = "error";
      error = `Keep only these nameservers at the registrar: ${nameservers.join(", ")}. Remove the old ones (${ns.found.filter((n) => !nameservers.includes(n)).join(", ")}).`;
    } else if (!manualStarted) {
      // Still on the old DNS: waiting for the switch, the old A record is not an error here.
      status = "pending";
      error = providerError;
      result.warnings = [];
    }
  }
  // Vercel: DNS can be right while the certificate is still being issued.
  if (status === "active" && providerState && !providerState.configured) {
    status = "verifying";
    error = undefined;
    result.warnings.push("DNS is correct. The hosting is issuing the HTTPS certificate (usually a few minutes).");
  }
  const now = new Date().toISOString();
  return store((doc) => {
    const record = owned(doc, siteId, domain);
    record.records = result.records;
    record.foundNameservers = nameservers.length ? ns.found : undefined;
    if (nameservers.length) record.nameservers = nameservers;
    record.status = status;
    record.checkedAt = now;
    record.error = error;
    record.warnings = result.warnings.length ? result.warnings : undefined;
    if (status === "active") record.verifiedAt ??= now;
    return view(record);
  });
}

export async function setPrimary(siteId: string, domain: string) {
  return store((doc) => {
    owned(doc, siteId, domain);
    for (const d of doc.domains) if (d.siteId === siteId) d.primary = d.domain === domain;
    return doc.domains.filter((d) => d.siteId === siteId).map(view);
  });
}

export async function removeDomain(siteId: string, domain: string) {
  await store((doc) => owned(doc, siteId, domain), false);
  await hostingProvider().detach(domain);
  return store((doc) => {
    const record = owned(doc, siteId, domain);
    doc.domains = doc.domains.filter((d) => d !== record);
    const rest = doc.domains.filter((d) => d.siteId === siteId);
    if (record.primary && rest.length && !rest.some((d) => d.primary))
      (rest.find((d) => d.verifiedAt) ?? rest[0]).primary = true;
    return rest.map(view);
  });
}

// Creates the records in the client's Cloudflare zone with their API token (sealed at rest,
// AES-GCM like the CRM Telegram token), then checks right away.
export async function connectCloudflare(siteId: string, domain: string, token: string) {
  const record = await store((doc) => structuredClone(owned(doc, siteId, domain)), false);
  const writable = record.records.filter((r) => r.purpose !== "ownership" || r.host.endsWith(domain));
  const { zoneId, changed } = await cloudflareConnect(token.trim(), registrable(domain), writable);
  await store((doc) => {
    owned(doc, siteId, domain).cloudflare = { zoneId, token: seal(token.trim()), at: new Date().toISOString() };
  });
  return { changed };
}
// The stored token, for a later re-sync (never returned to the browser).
export async function cloudflareToken(siteId: string, domain: string) {
  const sealed = await store((doc) => owned(doc, siteId, domain).cloudflare?.token, false);
  return sealed ? unseal(sealed) : null;
}

// Domains not yet active are re-checked in the background when the Domain screen or the
// cron (/api/cron/domains) asks; active ones once an hour.
export function checkDue(record: Pick<DomainRecord, "status" | "checkedAt">, now = Date.now()) {
  const age = record.checkedAt ? now - Date.parse(record.checkedAt) : Infinity;
  return record.status === "active" ? age > 60 * 60_000 : age > 60_000;
}
export async function checkDueDomains(siteId?: string) {
  const due = await store(
    (doc) => doc.domains.filter((d) => (!siteId || d.siteId === siteId) && checkDue(d)),
    false,
  );
  for (const d of due.slice(0, 20))
    try {
      await checkDomain(d.siteId, d.domain);
    } catch {
      // next round
    }
  return due.length;
}

// Public address of a website: its primary verified domain (else the first verified one).
const primaryCache = new Map<string, { at: number; domain: string | null }>();
export async function primaryDomain(siteId: string): Promise<string | null> {
  const hit = primaryCache.get(siteId);
  if (hit && Date.now() - hit.at < 10_000) return hit.domain;
  const domain = await store((doc) => {
    const verified = doc.domains.filter((d) => d.siteId === siteId && d.verifiedAt);
    return (verified.find((d) => d.primary) ?? verified[0])?.domain ?? null;
  }, false);
  primaryCache.set(siteId, { at: Date.now(), domain });
  return domain;
}
