import { z } from "zod";
import { safeUrl } from "./catalog";
const id = z.string().min(1).max(100);
const image = z
  .string()
  .max(2000)
  .refine((v) => !v || !!safeUrl(v, true), "Choose a valid image URL");
export const actionSchema = z.object({
  type: z.enum(["form", "service"]),
  target: id,
});
export const actionsSchema = z
  .record(z.string().max(100), actionSchema)
  .refine((v) => Object.keys(v).length <= 100);
export const formDefinitionSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  buttonLabel: z.string().trim().min(1).max(100),
  layout: z.enum(["compact", "split"]),
  image,
  fields: z
    .array(
      z
        .object({
          id,
          type: z.enum([
            "text",
            "email",
            "tel",
            "textarea",
            "select",
            "checkbox",
            "date",
            "number",
          ]),
          name: z
            .string()
            .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
            .refine(
              (v) =>
                !["website", "__proto__", "prototype", "constructor"].includes(
                  v.toLowerCase(),
                ),
            ),
          label: z.string().trim().min(1).max(200),
          placeholder: z.string().max(300),
          required: z.boolean(),
          width: z.enum(["half", "full"]),
          options: z.array(z.string().trim().min(1).max(200)).max(30),
        })
        .refine(
          (f) =>
            f.type !== "select" ||
            (f.options.length > 0 &&
              new Set(f.options).size === f.options.length),
          "Add unique select options",
        ),
    )
    .min(1)
    .max(30)
    .refine(
      (fields) =>
        new Set(fields.map((f) => f.name.toLowerCase())).size ===
          fields.length &&
        new Set(fields.map((f) => f.id)).size === fields.length,
      "Each field needs a unique name and ID",
    ),
});
export const serviceSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(120),
  summary: z.string().max(2000),
  body: z.string().max(20000),
  image,
  imageAlt: z.string().max(500),
  mode: z.enum(["modal", "drawer", "page", "editorial"]),
  status: z.enum(["Draft", "Published"]),
  formId: z.string().max(100),
});
