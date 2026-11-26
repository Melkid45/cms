import "server-only";
import { StoreError } from "../server";
import type { DnsRecord } from "./names";

// "Connect automatically through Cloudflare": the client pastes an API token limited to
// Zone → DNS → Edit for their zone, and we create/update the records ourselves (always
// "DNS only", so the hosting can issue the certificate). Cloudflare API v4.
const API = "https://api.cloudflare.com/client/v4";
type Envelope<T> = { success: boolean; errors?: { message: string }[]; result: T };
async function call<T>(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({ success: false }))) as Envelope<T>;
  if (!response.ok || !data.success)
    throw new StoreError(
      `Cloudflare: ${data.errors?.map((e) => e.message).join("; ") || `request failed (${response.status})`}`,
      response.status === 401 || response.status === 403 ? 400 : 502,
    );
  return data.result;
}
type CfRecord = { id: string; type: string; name: string; content: string; proxied?: boolean };

export async function cloudflareConnect(token: string, zone: string, records: DnsRecord[]) {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token))
    throw new StoreError("Paste the Cloudflare API token (not the Global API key).");
  const zones = await call<{ id: string; name: string }[]>(
    token,
    "GET",
    `/zones?name=${encodeURIComponent(zone)}`,
  );
  const zoneId = zones.find((z) => z.name === zone)?.id;
  if (!zoneId)
    throw new StoreError(
      `This token cannot see the zone ${zone}. Create it with Zone → DNS → Edit for ${zone}.`,
    );
  const changed: string[] = [];
  for (const record of records) {
    const existing = await call<CfRecord[]>(
      token,
      "GET",
      `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.host)}`,
    );
    const body = {
      type: record.type,
      name: record.host,
      content: record.value,
      ttl: 1, // automatic
      ...(record.type === "TXT" ? {} : { proxied: false }),
    };
    if (record.type === "TXT") {
      if (existing.some((r) => r.content.replace(/^"|"$/g, "") === record.value)) continue;
      await call(token, "POST", `/zones/${zoneId}/dns_records`, body);
    } else if (existing[0]) {
      if (existing[0].content === record.value && !existing[0].proxied) continue;
      await call(token, "PATCH", `/zones/${zoneId}/dns_records/${existing[0].id}`, body);
    } else {
      // A CNAME cannot live next to other records of the same name and vice versa.
      const other = await call<CfRecord[]>(
        token,
        "GET",
        `/zones/${zoneId}/dns_records?name=${encodeURIComponent(record.host)}`,
      );
      const clash = other.find((r) =>
        record.type === "CNAME" ? ["A", "AAAA", "CNAME"].includes(r.type) : r.type === "CNAME",
      );
      if (clash) await call(token, "DELETE", `/zones/${zoneId}/dns_records/${clash.id}`);
      await call(token, "POST", `/zones/${zoneId}/dns_records`, body);
    }
    changed.push(`${record.type} ${record.name}`);
  }
  return { zoneId, changed };
}
