import "server-only";
import { StoreError } from "../server";
import { isApex, type ImportRecord } from "./names";

// Hosting provider of custom domains. "vercel" (production) adds the domain to the Vercel
// project through the Vercel REST API; Vercel then verifies it and issues the HTTPS
// certificate itself. "local" (default, development) only compares DNS with the expected
// records from HOSTING_A_RECORD / HOSTING_CNAME_TARGET. BUILDER.md → Custom domains.
export interface Routing {
  a: string;
  cname: string;
}
export interface ProviderState {
  // Vercel accepted the domain for the project (its own ownership check).
  verified: boolean;
  // Vercel sees correct DNS and can issue the certificate.
  configured: boolean;
  // Vercel's TXT challenge when the domain is used by another Vercel account.
  verification: { host: string; value: string }[];
  error?: string;
}
export interface HostingProvider {
  id: "local" | "vercel";
  // false = test mode: nothing is created at the hosting, record copies are only previewed.
  live: boolean;
  // Nameservers the client sets at the registrar (main mode), from the hosting.
  nameservers(domain: string): Promise<string[]>;
  // DNS records in the hosting's zone of the domain (copied email records).
  createRecord(domain: string, record: ImportRecord): Promise<string>;
  deleteRecord(domain: string, id: string): Promise<void>;
  routing(domain: string): Promise<Routing>;
  attach(domain: string): Promise<void>;
  // null = the provider has no opinion; our DNS + TXT check decides.
  state(domain: string): Promise<ProviderState | null>;
  detach(domain: string): Promise<void>;
}

// Vercel's long-standing defaults (docs: Domains → Troubleshooting). Newer Vercel projects can
// show a project-specific A address / CNAME target; the vercel provider reads those from the API.
export const DEFAULT_ROUTING: Routing = { a: "76.76.21.21", cname: "cname.vercel-dns.com" };
const envRouting = (): Routing => ({
  a: process.env.HOSTING_A_RECORD?.trim() || DEFAULT_ROUTING.a,
  cname: (process.env.HOSTING_CNAME_TARGET?.trim() || DEFAULT_ROUTING.cname).replace(/\.$/, ""),
});

// Vercel's usual nameservers; the vercel provider reads the domain's own from the API.
export const DEFAULT_NAMESERVERS = ["ns1.vercel-dns.com", "ns2.vercel-dns.com"];
const envNameservers = () => {
  const list = (process.env.HOSTING_NAMESERVERS || "")
    .split(",")
    .map((ns) => ns.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
  return list.length ? list : DEFAULT_NAMESERVERS;
};
const local: HostingProvider = {
  id: "local",
  live: false,
  nameservers: async () => envNameservers(),
  createRecord: async () => "",
  deleteRecord: async () => {},
  routing: async () => envRouting(),
  attach: async () => {},
  state: async () => null,
  detach: async () => {},
};

const API = "https://api.vercel.com";
export const vercelConfigured = () =>
  !!process.env.VERCEL_TOKEN && !!process.env.VERCEL_PROJECT_ID;
async function vercel<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const url = new URL(API + path);
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}
type VercelError = { error?: { code?: string; message?: string } };
type ProjectDomain = VercelError & {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};
const project = () => encodeURIComponent(process.env.VERCEL_PROJECT_ID!);
const vercelMessage = (data: VercelError, fallback: string) =>
  data.error?.message || fallback;

// Endpoints (openapi.vercel.sh, checked 2026-11-20): POST /v10/projects/{id}/domains,
// GET /v9/projects/{id}/domains/{domain}, POST /v9/projects/{id}/domains/{domain}/verify,
// DELETE /v9/projects/{id}/domains/{domain}, GET /v6/domains/{domain}/config.
// DNS zone on Vercel (nameservers mode, checked 2026-11-20): POST /v7/domains {name, method:"add",
// zone:true}, GET /v5/domains/{domain} (intendedNameservers), POST /v2/domains/{domain}/records,
// DELETE /v2/domains/{domain}/records/{recordId}.
const vercelProvider: HostingProvider = {
  id: "vercel",
  live: true,
  async nameservers(domain) {
    const { status, data } = await vercel<{ domain?: { intendedNameservers?: string[] } } & VercelError>(
      "GET",
      `/v5/domains/${encodeURIComponent(domain)}`,
    );
    const list = status === 200 ? data.domain?.intendedNameservers : undefined;
    return list?.length ? list.map((ns) => ns.toLowerCase().replace(/\.$/, "")) : envNameservers();
  },
  async createRecord(domain, record) {
    const { status, data } = await vercel<{ uid?: string } & VercelError>(
      "POST",
      `/v2/domains/${encodeURIComponent(domain)}/records`,
      {
        name: record.name,
        type: record.type,
        value: record.value,
        ttl: 3600,
        ...(record.type === "MX" ? { mxPriority: record.priority ?? 10 } : {}),
        comment: "Copied by Harbstone before the nameserver switch",
      },
    );
    if (status !== 200 || !data.uid)
      throw new StoreError(vercelMessage(data, `Hosting refused the record (${status}).`), 502);
    return data.uid;
  },
  async deleteRecord(domain, id) {
    const { status, data } = await vercel<VercelError>(
      "DELETE",
      `/v2/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(id)}`,
    );
    if (status !== 200 && status !== 404)
      throw new StoreError(vercelMessage(data, `Hosting could not remove the record (${status}).`), 502);
  },
  async routing(domain) {
    const fallback = envRouting();
    try {
      const { status, data } = await vercel<{
        recommendedIPv4?: { rank: number; value: string[] }[];
        recommendedCNAME?: { rank: number; value: string }[];
      }>("GET", `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${project()}`);
      if (status !== 200) return fallback;
      const ip = [...(data.recommendedIPv4 ?? [])].sort((a, b) => a.rank - b.rank)[0]?.value?.[0];
      const cname = [...(data.recommendedCNAME ?? [])].sort((a, b) => a.rank - b.rank)[0]?.value;
      return { a: ip || fallback.a, cname: (cname || fallback.cname).replace(/\.$/, "") };
    } catch {
      return fallback;
    }
  },
  async attach(domain) {
    const add = async (name: string, redirect?: string) => {
      const { status, data } = await vercel<ProjectDomain>(
        "POST",
        `/v10/projects/${project()}/domains`,
        redirect ? { name, redirect, redirectStatusCode: 308 } : { name },
      );
      // 400 "already exists on the project" is fine: re-adding after a retry.
      if (status === 200 || (status === 400 && /already/i.test(data.error?.message || ""))) return;
      if (status === 409)
        throw new StoreError("This domain is already used by another website on the hosting.", 409);
      throw new StoreError(vercelMessage(data, `Hosting refused the domain (${status}).`), 502);
    };
    // The domain's DNS zone on Vercel (for the nameservers mode and the copied email records).
    if (isApex(domain)) {
      const zone = await vercel<VercelError>("POST", "/v7/domains", { name: domain, method: "add", zone: true });
      if (zone.status !== 200 && !(zone.status === 400 || zone.status === 409) )
        throw new StoreError(vercelMessage(zone.data, `Hosting refused the domain (${zone.status}).`), 502);
    }
    await add(domain);
    // www.<apex> redirects to the apex on Vercel's edge, with its own certificate.
    if (isApex(domain)) await add(`www.${domain}`, domain).catch(() => {});
  },
  async state(domain) {
    const path = `/v9/projects/${project()}/domains/${encodeURIComponent(domain)}`;
    let { status, data } = await vercel<ProjectDomain>("GET", path);
    if (status === 404) {
      await this.attach(domain);
      ({ status, data } = await vercel<ProjectDomain>("GET", path));
    }
    if (status !== 200) return { verified: false, configured: false, verification: [], error: vercelMessage(data, `Hosting check failed (${status}).`) };
    if (!data.verified) {
      const verify = await vercel<ProjectDomain>("POST", `${path}/verify`);
      if (verify.status === 200 && verify.data.verified) data = { ...data, verified: true };
    }
    const config = await vercel<{ misconfigured?: boolean }>(
      "GET",
      `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${project()}`,
    );
    return {
      verified: data.verified,
      configured: config.status === 200 && config.data.misconfigured === false,
      verification: data.verified
        ? []
        : (data.verification ?? [])
            .filter((v) => v.type === "TXT")
            .map((v) => ({ host: v.domain, value: v.value })),
    };
  },
  async detach(domain) {
    for (const name of isApex(domain) ? [`www.${domain}`, domain] : [domain]) {
      const { status, data } = await vercel<VercelError>(
        "DELETE",
        `/v9/projects/${project()}/domains/${encodeURIComponent(name)}`,
      );
      if (status !== 200 && status !== 404 && name === domain)
        throw new StoreError(vercelMessage(data, `Hosting could not remove the domain (${status}).`), 502);
    }
  },
};

// Vercel only when its token and project are configured (Jura sets them on production);
// until then the local provider is used and no Vercel API call is ever made.
export function hostingProvider(): HostingProvider {
  return vercelConfigured() ? vercelProvider : local;
}
