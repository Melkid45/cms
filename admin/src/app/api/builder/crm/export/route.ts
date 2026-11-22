import { errorResponse } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { crmData } from "@/lib/builder/crm/actions";

export const runtime = "nodejs";
// CSV of all contacts (UTF-8 with BOM for Excel). Cells that start like a formula are
// prefixed with ' so a spreadsheet never runs them.
const cell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export async function GET(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    const data = await crmData(site, identity);
    const rows = [
      ["name", "email", "phone", "company", "language", "status", "tags", "source", "source_page", "utm_source", "utm_medium", "utm_campaign", "enquiries", "orders", "revenue", "currency", "created", "last_activity"],
      ...data.contacts.map((c) => [
        c.name, c.email, c.phone, c.company, c.language, c.status, c.tags.join("; "),
        c.source.kind, c.source.page || "", c.source.utm?.source || "", c.source.utm?.medium || "", c.source.utm?.campaign || "",
        c.enquiries, c.orders, c.revenue.toFixed(2), c.currency, c.createdAt.slice(0, 10), c.lastActivity.slice(0, 10),
      ]),
    ];
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-${site.key}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
