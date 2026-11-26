import "server-only";
// Latvian open data used by the instant checkout popup (as the Zcena prototype's own server did):
// the Register of Enterprises (company name and address by an 11-digit registration number) and
// the address register VARIS (address suggestions with coordinates). data.gov.lv, free, no key;
// browsers cannot call it (no CORS), so /api/shop/lv asks it from here. Answers are cached in
// memory; a failure is reported as "unavailable" and the popup keeps working without it.
const UR = "25e80bf3-f107-4ab4-89ef-251b5b9374e9"; // Uzņēmumu reģistra atvērtie dati
const VARIS = "a510737a-18ce-400f-ad4b-04fce5228272"; // VARIS: ēku un zemes vienību adreses
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 6 * 3600e3;

async function datastore(params: Record<string, string>) {
  const url = `https://data.gov.lv/dati/api/3/action/datastore_search?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value as { records: Record<string, unknown>[] };
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  const json = (await response.json()) as { success?: boolean; result?: { records: Record<string, unknown>[] } };
  if (!response.ok || !json.success || !json.result) throw new Error("register unavailable");
  if (cache.size > 500) cache.clear();
  cache.set(url, { at: Date.now(), value: json.result });
  return json.result;
}

export type CompanyLookup =
  | { found: false }
  | { found: true; active: boolean; name: string; address: string; reg: string };
export async function lookupCompany(reg: string): Promise<CompanyLookup> {
  if (!/^\d{11}$/.test(reg)) return { found: false };
  const { records } = await datastore({ resource_id: UR, filters: JSON.stringify({ regcode: reg }), limit: "1" });
  const c = records[0];
  if (!c) return { found: false };
  return {
    found: true,
    reg,
    name: String(c.name || ""),
    address: String(c.address || ""),
    active: !c.terminated && !String(c.closed || "").trim(),
  };
}

export async function searchAddress(q: string) {
  const query = q.trim().slice(0, 120);
  if (query.length < 4) return [];
  const { records } = await datastore({ resource_id: VARIS, q: query, limit: "6" });
  return records
    .filter((x) => x.STATUSS !== "DEL" && x.STD)
    .map((x) => ({ label: String(x.STD), lat: Number(x.DD_N), lon: Number(x.DD_E) }));
}

// Small per-visitor limit for the public lookups (per server instance).
const hits = new Map<string, number[]>();
export function lookupAllowed(ip: string, max = 120, windowMs = 10 * 60000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}
