import { z } from "zod";
import { after } from "next/server";
import { onEnquiry } from "@/lib/builder/crm/events";
import { definition } from "@/lib/builder/catalog";
import type { TemplateNode } from "@/lib/builder/types";
import { readSiteProject } from "@/lib/builder/products/public";
import {
  clientIp,
  errorResponse,
  legacySiteId,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { formMessage, formSuccess } from "@/lib/builder/i18n";
import {
  receiveSubmission,
  validateFormToken,
} from "@/lib/builder/submissions";
export const runtime = "nodejs";
const schema = z.object({
  // Website id; forms published before multi-site support omit it.
  site: z.string().max(40).default(legacySiteId),
  pageId: z.string().max(100),
  sectionId: z.string().max(100),
  token: z.string().max(1000),
  website: z.string().max(500).default(""),
  // Page language, used only to word error replies (the success text comes from the page).
  locale: z.string().max(10).optional(),
  values: z
    .record(z.string().max(100), z.string().max(5000))
    .refine((v) => Object.keys(v).length <= 30),
});
export async function POST(request: Request) {
  let locale: string | undefined;
  try {
    const origin = request.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !==
        (request.headers.get("host") || new URL(request.url).host)
    )
      throw new StoreError("Invalid origin.", 403);
    const parsed = schema.safeParse(await readJson(request, 30000));
    if (!parsed.success) throw new StoreError("Check the form fields.");
    const input = parsed.data;
    locale = input.locale;
    if (input.website)
      return Response.json({
        ok: true,
        message: formMessage(
          input.locale,
          "Thank you. Your message has been received.",
        ),
      });
    // The signed token is checked first: junk requests never reach storage.
    if (!validateFormToken(input.token, input.pageId, input.site))
      throw new StoreError("Please reload the page and try again.", 403);
    if (!(await readRegistry()).sites.some((site) => site.id === input.site))
      throw new StoreError("Form unavailable.", 404);
    // Product pages built from the catalogue (lib/builder/products) take enquiries too.
    const project = await readSiteProject(input.site);
    const page = project.pages.find(
      (p) => p.id === input.pageId && !p.deletedAt && p.published,
    );
    if (!page || !project.forms?.enabled)
      throw new StoreError("Form unavailable.", 404);
    locale = page.published!.locale;
    const block = [...page.published!.sections, project.layout.footer].find(
      (s) => s.id === input.sectionId && !s.hidden,
    );
    const entry = block && definition(block.variant);
    if (!entry) throw new StoreError("Form unavailable.", 404);
    const fields: {
      name: string;
      type?: string;
      required: boolean;
      attrs: Record<string, string>;
      options: string[];
    }[] = [];
    let hasForm = false;
    // Saved text of a template field (radio labels, calculator settings).
    const saved = (key?: string) =>
      key
        ? String(
            block!.values[key] ??
              entry.fields.find((f) => f.key === key)?.value ??
              "",
          ).trim()
        : "";
    const texts = (node: TemplateNode): string[] => [
      ...(node.field ? [saved(node.field)] : []),
      ...(node.children || []).flatMap(texts),
    ];
    // Price calculator (calculator-v40): estimate = width in metres x saved price per metre.
    let calc: { rate: number; unit: string } | null = null;
    function walk(nodes: TemplateNode[], inside = false, label = "") {
      for (const node of nodes) {
        const active = inside || node.tag === "form";
        if (node.tag === "form") hasForm = true;
        const attrs = node.attrs || {};
        if (node.tag === "form" && attrs["data-calc"] !== undefined)
          calc = calc || { rate: 0, unit: "€" };
        if (attrs["data-calc-rate"] !== undefined)
          calc = {
            unit: calc?.unit || "€",
            rate: parseFloat(saved(node.field).replace(/\s/g, "").replace(",", ".")) || 0,
          };
        if (attrs["data-calc-currency"] !== undefined)
          calc = { rate: calc?.rate || 0, unit: saved(node.field) || "€" };
        if (
          active &&
          ["input", "textarea", "select"].includes(node.tag || "") &&
          typeof attrs.name === "string" &&
          !["submit", "hidden", "button"].includes(String(attrs.type))
        ) {
          // Accepted values: a checkbox sends its value ("on" without one); a radio
          // sends its template value or its saved label (the site script uses the label).
          const options =
            attrs.type === "checkbox"
              ? [attrs.value || "on"]
              : ([attrs.value, label].filter(Boolean) as string[]);
          const same = fields.find(
            (f) => f.name === attrs.name && f.type === "radio",
          );
          if (same && attrs.type === "radio") same.options.push(...options);
          else
            fields.push({
              name: attrs.name,
              type: String(attrs.type || ""),
              required: attrs.required !== undefined,
              attrs,
              options,
            });
        }
        if (node.children)
          walk(
            node.children,
            active,
            node.tag === "label" ? texts(node).join(" ").trim() : label,
          );
      }
    }
    walk(entry.nodes);
    if (!hasForm || !fields.length)
      throw new StoreError("Form unavailable.", 404);
    const values: Record<string, string> = {};
    for (const field of fields) {
      const value = (input.values[field.name] || "").trim();
      if (field.required && !value)
        throw new StoreError("Please fill in all required fields.");
      if (
        field.type === "email" &&
        value &&
        !z.email().safeParse(value).success
      )
        throw new StoreError("Enter a valid email address.");
      if (
        field.type === "tel" &&
        value &&
        !/^\+?[\d\s().-]{6,40}$/.test(value)
      )
        throw new StoreError("Enter a valid phone number.");
      // Booking fields (contact-v50): browser date/time formats only.
      if (
        (field.type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) ||
        (field.type === "time" && value && !/^\d{2}:\d{2}(:\d{2})?$/.test(value))
      )
        throw new StoreError("Check the date and time.");
      if (field.type === "number" && value) {
        const n = Number(value),
          min = Number(field.attrs.min),
          max = Number(field.attrs.max);
        if (
          !Number.isFinite(n) ||
          (field.attrs.min !== undefined && n < min) ||
          (field.attrs.max !== undefined && n > max)
        )
          throw new StoreError("Check the numbers in the form.");
      }
      if (
        ["checkbox", "radio"].includes(field.type || "") &&
        value &&
        !(field.options.length ? field.options : ["on"]).includes(value)
      )
        throw new StoreError("Check the form fields.");
      if (value) values[field.name] = value;
    }
    const estimate = calc as { rate: number; unit: string } | null;
    if (estimate && estimate.rate > 0 && values.width)
      values.estimate = `${Math.round((Number(values.width) / 1000) * estimate.rate)} ${estimate.unit}`;
    if (!Object.keys(values).length)
      throw new StoreError("Your message is empty.");
    const enquiry = await receiveSubmission(
      input.site,
      {
        pageId: page.id,
        pageTitle: page.published!.title,
        sectionId: input.sectionId,
        values,
      },
      clientIp(request),
      project.forms.recipient,
      project.website,
    );
    // CRM: contact (+ deal), in-app and Telegram notification, after the response.
    after(() => onEnquiry(input.site, enquiry));
    return Response.json({
      ok: true,
      message: formSuccess(project, page.published!.locale),
    });
  } catch (error) {
    const response = errorResponse(error);
    if (!locale) return response;
    const body = (await response.json()) as { error: string };
    return Response.json(
      { error: formMessage(locale, body.error) },
      { status: response.status },
    );
  }
}
