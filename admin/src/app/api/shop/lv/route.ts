import { clientIp } from "@/lib/builder/server";
import { lookupAllowed, lookupCompany, searchAddress } from "@/lib/builder/lv-register";
export const runtime = "nodejs";

// Public lookups of the instant checkout popup (Latvian open data, see lv-register.ts):
//   ?company=40003032949 → { found, active, name, address }
//   ?address=Brīvības iela 10 → [{ label, lat, lon }]
// 503 when the register cannot be reached: the popup then accepts the number as typed.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const headers = { "Cache-Control": "no-store" };
  if (!lookupAllowed(clientIp(request)))
    return Response.json({ error: "Too many requests." }, { status: 429, headers });
  try {
    const company = url.searchParams.get("company");
    if (company !== null) {
      const reg = company.replace(/\D/g, "");
      if (!/^\d{11}$/.test(reg))
        return Response.json({ error: "Bad registration number." }, { status: 400, headers });
      return Response.json(await lookupCompany(reg), { headers });
    }
    return Response.json(await searchAddress(url.searchParams.get("address") || ""), { headers });
  } catch {
    return Response.json({ error: "The register is unavailable." }, { status: 503, headers });
  }
}
