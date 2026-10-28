import { z } from "zod";
import { definition } from "@/lib/builder/catalog";
import type { TemplateNode } from "@/lib/builder/types";
import { readProject, errorResponse, StoreError } from "@/lib/builder/server";
import {
  receiveSubmission,
  validateFormToken,
} from "@/lib/builder/submissions";
export const runtime = "nodejs";
const schema = z.object({
  pageId: z.string().max(100),
  sectionId: z.string().max(100),
  token: z.string().max(1000),
  website: z.string().max(500).default(""),
  values: z
    .record(z.string().max(100), z.string().max(5000))
    .refine((v) => Object.keys(v).length <= 30),
});
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !==
        (request.headers.get("host") || new URL(request.url).host)
    )
      throw new StoreError("Invalid origin.", 403);
    if (Number(request.headers.get("content-length") || 0) > 30000)
      throw new StoreError("Message is too large.", 413);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new StoreError("Check the form fields.");
    const input = parsed.data;
    if (input.website)
      return Response.json({
        ok: true,
        message: "Thank you. Your message has been received.",
      });
    if (!validateFormToken(input.token, input.pageId))
      throw new StoreError("Please reload the page and try again.", 403);
    const project = await readProject();
    const page = project.pages.find(
      (p) => p.id === input.pageId && !p.deletedAt && p.published,
    );
    if (!page || !project.forms?.enabled)
      throw new StoreError("Form unavailable.", 404);
    const block = [...page.published!.sections, project.layout.footer].find(
      (s) => s.id === input.sectionId && !s.hidden,
    );
    const entry = block && definition(block.variant);
    if (!entry) throw new StoreError("Form unavailable.", 404);
    const fields: { name: string; type?: string; required: boolean }[] = [];
    let hasForm = false;
    function walk(nodes: TemplateNode[], inside = false) {
      for (const node of nodes) {
        const active = inside || node.tag === "form";
        if (node.tag === "form") hasForm = true;
        const attrs = node.attrs || {};
        if (
          active &&
          ["input", "textarea", "select"].includes(node.tag || "") &&
          typeof attrs.name === "string" &&
          !["submit", "hidden", "button"].includes(String(attrs.type))
        )
          fields.push({
            name: attrs.name,
            type: String(attrs.type || ""),
            required: attrs.required !== undefined,
          });
        if (node.children) walk(node.children, active);
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
      if (value) values[field.name] = value;
    }
    if (!Object.keys(values).length)
      throw new StoreError("Your message is empty.");
    await receiveSubmission(
      {
        pageId: page.id,
        pageTitle: page.published!.title,
        sectionId: input.sectionId,
        values,
      },
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local",
      project.forms.recipient,
      project.website,
    );
    return Response.json({ ok: true, message: project.forms.successMessage });
  } catch (error) {
    return errorResponse(error);
  }
}
