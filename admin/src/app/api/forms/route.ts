import { z } from "zod";
import { validateFormValues } from "@/lib/builder/form-values";
import { definition } from "@/lib/builder/catalog";
import type { TemplateNode } from "@/lib/builder/types";
import { connectedContent } from "@/lib/builder/inline-content";
import { readProject, errorResponse, StoreError } from "@/lib/builder/server";
import {
  receiveSubmission,
  validateFormToken,
} from "@/lib/builder/submissions";
export const runtime = "nodejs";
const schema = z.object({
  pageId: z.string().max(100),
  formId: z.string().max(100).optional(),
  serviceId: z.string().max(300).optional(),
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
    const project = connectedContent(await readProject(), [], true).project;
    const page = project.pages.find(
      (p) => p.id === input.pageId && !p.deletedAt && p.published,
    );
    const standaloneService = input.pageId.startsWith("service:")
      ? project.services?.find(
          (s) => s.id === input.pageId.slice(8) && s.status === "Published",
        )
      : undefined;
    if ((!page && !standaloneService) || !project.forms?.enabled)
      throw new StoreError("Form unavailable.", 404);
    const block = page
      ? [
          ...page.published!.sections,
          project.layout.header,
          project.layout.footer,
        ].find((s) => s.id === input.sectionId && !s.hidden)
      : undefined;
    if (input.formId) {
      const form = project.formDefinitions?.find((f) => f.id === input.formId);
      const actions = [
        block?.actions,
        ...Object.values(block?.collections || {})
          .flat()
          .map((i) => i.actions),
      ].flatMap((a) => Object.values(a || {}));
      const service = input.serviceId
        ? project.services?.find(
            (s) => s.id === input.serviceId && s.status === "Published",
          )
        : undefined;
      const boundService =
        service &&
        actions.some((a) => a.type === "service" && a.target === service.id) &&
        service.formId === input.formId;
      const standalone =
        standaloneService &&
        input.sectionId === `service:${standaloneService.id}` &&
        standaloneService.formId === input.formId;
      const boundForm =
        block &&
        (block.formId === input.formId ||
          actions.some((a) => a.type === "form" && a.target === input.formId));
      if (!form || (!boundForm && !boundService && !standalone))
        throw new StoreError("Form unavailable.", 404);
      let values: Record<string, string>;
      try {
        values = validateFormValues(form, input.values);
      } catch (error) {
        throw new StoreError(
          error instanceof Error ? error.message : "Check the form fields.",
        );
      }
      await receiveSubmission(
        {
          pageId: page?.id || input.pageId,
          pageTitle: page?.published?.title || standaloneService!.title,
          sectionId: input.sectionId,
          values: {
            ...values,
            ...(service || standaloneService
              ? { Service: (service || standaloneService)!.title }
              : {}),
          },
        },
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local",
        project.forms.recipient,
        project.website,
      );
      return Response.json({ ok: true, message: project.forms.successMessage });
    }
    if (!page) throw new StoreError("Form unavailable.", 404);
    const entry = block && !block.formId && definition(block.variant);
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
