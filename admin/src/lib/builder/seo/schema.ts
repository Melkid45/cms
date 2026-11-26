import { z } from "zod";

// Website-wide SEO settings (Project.seo), validated on every project save.
const text = (max: number) => z.string().trim().max(max);
const coordinate = (limit: number) =>
  z
    .string()
    .trim()
    .max(20)
    .refine(
      (v) => v === "" || (/^-?\d+(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= limit),
      "Coordinates are decimal degrees, e.g. 56.9496.",
    );
// Old paths are stored normalised: leading slash, no query/hash, no trailing slash.
export function normalizePath(value: string) {
  let path = value.trim();
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return "";
  }
  path = path.split(/[?#]/)[0];
  try {
    path = decodeURI(path);
  } catch {
    // keep as typed
  }
  path = ("/" + path.replace(/^\/+/, "")).replace(/\/+$/, "");
  return (path || "/").toLowerCase();
}
export const siteSeoSchema = z
  .object({
    business: z
      .object({
        type: z.string().regex(/^[A-Za-z]{2,60}$/, "Choose a business type."),
        name: text(200),
        legalName: text(200),
        description: text(1000),
        street: text(300),
        city: text(120),
        region: text(120),
        postalCode: text(40),
        country: text(60),
        phone: text(60),
        email: z.union([z.literal(""), z.email()]),
        hours: text(1000).refine(
          (v) =>
            v
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .every((l) =>
                /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?(,(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?)* \d{2}:\d{2}-\d{2}:\d{2}$/.test(
                  l,
                ),
              ),
          'Opening hours: one rule per line, e.g. "Mo-Fr 09:00-18:00".',
        ),
        lat: coordinate(90),
        lng: coordinate(180),
        logo: text(2000),
        priceRange: text(40),
        sameAs: text(4000).refine(
          (v) =>
            v
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .every((l) => /^https:\/\/[^\s]+$/.test(l)),
          "Profile links: one https:// address per line.",
        ),
      })
      .optional(),
    verification: z
      .object({
        // Only the token (content="…"), never a whole tag.
        google: z
          .string()
          .trim()
          .max(200)
          .regex(/^[A-Za-z0-9_-]*$/, "Google verification: paste only the content value.")
          .optional(),
        bing: z
          .string()
          .trim()
          .max(200)
          .regex(/^[A-Za-z0-9_-]*$/, "Bing verification: paste only the content value.")
          .optional(),
      })
      .optional(),
    redirects: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          from: z
            .string()
            .max(500)
            .transform(normalizePath)
            .refine((v) => v.length > 1, "A redirect needs an old path."),
          to: z
            .string()
            .trim()
            .min(1, "A redirect needs a target page.")
            .max(2000)
            .refine(
              (v) => /^[\w-]{1,100}$/.test(v) || v.startsWith("/") || /^https?:\/\//.test(v),
              "Redirect target: a page, a /path or an http(s) address.",
            ),
        }),
      )
      .max(500)
      .refine(
        (list) => new Set(list.map((r) => r.from)).size === list.length,
        "Each old path can be redirected only once.",
      )
      .optional(),
    hideSite: z.boolean().optional(),
    blockAiTraining: z.boolean().optional(),
  })
  .optional();
