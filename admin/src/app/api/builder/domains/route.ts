import { after } from "next/server";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  addDomain,
  checkDomain,
  checkDueDomains,
  connectCloudflare,
  listDomains,
  MAX_DOMAINS_PER_SITE,
  removeDomain,
  rescanImports,
  setImports,
  setPrimary,
} from "@/lib/builder/domains/store";
import { hostingProvider, vercelConfigured } from "@/lib/builder/domains/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { headers: { "Cache-Control": "no-store" } };

// Settings → Domain. Any account that may open the website (client of that website, designer,
// super admin); authorizeSite returns 403 for other websites.
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const data = await listDomains(site.id);
    // Automatic re-check of domains that are not active yet (and hourly of active ones).
    if (data.domains.length) after(() => checkDueDomains(site.id).catch(() => {}));
    return Response.json(
      {
        site: { id: site.id, key: site.key, name: site.name },
        domains: data.domains,
        provider: hostingProvider().id,
        live: hostingProvider().live,
        vercel: vercelConfigured(),
        max: MAX_DOMAINS_PER_SITE,
      },
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

type Body = { action?: string; domain?: string; token?: string; selected?: unknown };
export async function POST(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const body = (await readJson(request, 65536)) as Body;
    const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!domain) throw new StoreError("Enter a domain.");
    switch (body.action) {
      case "add": {
        const added = await addDomain(site, domain);
        // First check right away: records may already be in place.
        const checked = await checkDomain(site.id, added.domain).catch(() => added);
        return Response.json({ domain: checked }, { status: 201, ...noStore });
      }
      case "check":
        return Response.json({ domain: await checkDomain(site.id, domain) }, noStore);
      case "primary":
        return Response.json({ domains: await setPrimary(site.id, domain) }, noStore);
      case "remove":
        return Response.json({ domains: await removeDomain(site.id, domain) }, noStore);
      // Email records copied to the hosting DNS: ticks, and a fresh read of the old DNS.
      case "imports": {
        const selected = Array.isArray(body.selected)
          ? body.selected.filter((id): id is string => typeof id === "string").slice(0, 200)
          : [];
        return Response.json({ domain: await setImports(site.id, domain, selected) }, noStore);
      }
      case "scan":
        return Response.json({ domain: await rescanImports(site.id, domain) }, noStore);
      case "cloudflare": {
        if (typeof body.token !== "string") throw new StoreError("Paste the Cloudflare API token.");
        const { changed } = await connectCloudflare(site.id, domain, body.token);
        return Response.json(
          { changed, domain: await checkDomain(site.id, domain) },
          noStore,
        );
      }
      default:
        throw new StoreError("Unknown action.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
