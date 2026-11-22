// Host → website lookup for src/proxy.ts. Deliberately small: no imports of the CMS store
// (the proxy is bundled separately), one read of the "domains" document with a short
// in-memory cache. Writes happen only in domains/store.ts.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { DomainRecord, DomainsDocument } from "./names";

type Lookup = { at: number; mtime: number; doc: DomainsDocument | null };
const globalLookup = globalThis as typeof globalThis & {
  domainLookup?: Lookup;
  domainSql?: ReturnType<typeof postgres>;
};
// Same location rules as server.ts (dataDirectory) and doc-store.ts (file name).
const file = () =>
  path.join(
    !process.env.VERCEL && process.env.CMS_DATA_DIRECTORY
      ? path.resolve(/* turbopackIgnore: true */ process.env.CMS_DATA_DIRECTORY)
      : path.join(/* turbopackIgnore: true */ process.cwd(), ".data"),
    "domains.json",
  );

async function read(): Promise<DomainsDocument | null> {
  const cached = globalLookup.domainLookup;
  if (process.env.DATABASE_URL) {
    if (cached && Date.now() - cached.at < 30_000) return cached.doc;
    const sql = (globalLookup.domainSql ??= postgres(process.env.DATABASE_URL, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
    }));
    let doc: DomainsDocument | null = null;
    try {
      const [row] = await sql`SELECT document FROM harbstone_project WHERE id='domains'`;
      doc = (row?.document as DomainsDocument) ?? null;
    } catch {
      // table not created yet
    }
    globalLookup.domainLookup = { at: Date.now(), mtime: 0, doc };
    return doc;
  }
  // Local files: re-read only when the file changed (checked at most every 2 s).
  if (cached && Date.now() - cached.at < 2_000) return cached.doc;
  let mtime = -1;
  try {
    mtime = (await stat(file())).mtimeMs;
  } catch {}
  if (cached && cached.mtime === mtime) {
    cached.at = Date.now();
    return cached.doc;
  }
  let doc: DomainsDocument | null = null;
  if (mtime >= 0)
    try {
      doc = JSON.parse(await readFile(file(), "utf8"));
    } catch {}
  globalLookup.domainLookup = { at: Date.now(), mtime, doc };
  return doc;
}

export type HostMatch =
  // Serve the website (host is its primary domain).
  | { kind: "site"; siteKey: string; domain: string }
  // Alias, www. or a non-primary domain: permanent redirect to the primary domain.
  | { kind: "redirect"; domain: string }
  // Known but not verified yet.
  | { kind: "pending" }
  // Nothing registered for this host.
  | { kind: "unknown" }
  // The feature is not in use on this installation (no domains document).
  | { kind: "none" };

export async function matchHost(host: string): Promise<HostMatch> {
  const doc = await read();
  if (!doc?.domains?.length) return { kind: "none" };
  const find = (name: string) => doc.domains.find((d) => d.domain === name);
  const direct = find(host);
  const record: DomainRecord | undefined =
    direct ?? (host.startsWith("www.") ? find(host.slice(4)) : undefined);
  if (!record) return { kind: "unknown" };
  if (!record.verifiedAt) return { kind: "pending" };
  const verified = doc.domains.filter((d) => d.siteId === record.siteId && d.verifiedAt);
  const primary = (verified.find((d) => d.primary) ?? verified[0]).domain;
  if (direct && primary === host) return { kind: "site", siteKey: record.siteKey, domain: host };
  return { kind: "redirect", domain: primary };
}
