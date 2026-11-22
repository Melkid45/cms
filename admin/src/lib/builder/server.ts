import "server-only";
import { FONT_PAIR_IDS } from "./font-pairs";
import { SPACINGS, BUTTON_SHAPES } from "./style-presets";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  authConfigured,
  localAccess,
  localRequest,
  sessionIdentity,
  ownerIdentity,
} from "./auth";
import { accountIdentity } from "./accounts";
import { clientProjectError, type Role } from "./permissions";
import { legacySiteId } from "./access";
import postgres from "postgres";
import { z } from "zod";
import { seedProject } from "./seed";
import { definition } from "./catalog";
import { separateLayoutMenus } from "./menus";
import { normalizeProject, preparePages } from "./workflows";
import { LOCALES } from "./i18n";
import { siteSeoSchema } from "./seo/schema";
import type { Project } from "./types";

export const dataDirectory =
  !process.env.VERCEL && process.env.CMS_DATA_DIRECTORY
    ? path.resolve(/* turbopackIgnore: true */ process.env.CMS_DATA_DIRECTORY)
    : path.join(process.cwd(), ".data");
const globalStore = globalThis as typeof globalThis & {
  cmsQueue?: Promise<unknown>;
  cmsSql?: ReturnType<typeof postgres>;
  cmsDatabaseReady?: Promise<void>;
};
const section = z.object({
  clientAccess: z
    .object({
      text: z.boolean(),
      images: z.boolean(),
      reorder: z.boolean(),
      collections: z.array(z.string().max(100)).max(100).optional(),
      lockedFields: z.array(z.string().max(100)).max(1000),
    })
    .optional(),
  id: z.string().min(1).max(100),
  variant: z.string().refine((id) => !!definition(id), "Unknown variation"),
  values: z
    .record(z.string(), z.string().max(20000))
    .refine((v) => Object.keys(v).length <= 1000),
  hidden: z.boolean().optional(),
  tone: z.enum(["tint", "dark", "accent"]).optional(),
  collections: z
    .record(
      z.string(),
      z
        .array(
          z.object({
            id: z.string().min(1).max(100),
            template: z.number().int().min(0).max(100),
            values: z.record(z.string(), z.string().max(20000)),
          }),
        )
        .min(1)
        // Per-group limits (default 30, catalogue grids more) are checked against the catalogue on save.
        .max(80),
    )
    .optional(),
});
// Optional page SEO extras (social card texts, canonical override): lib/builder/seo.
const seoExtras = {
  ogTitle: z.string().max(300).optional(),
  ogDescription: z.string().max(1000).optional(),
  canonical: z
    .union([
      z.literal(""),
      z
        .url()
        .max(2000)
        .refine((value) => /^https?:\/\//i.test(value), "Use an http(s) address."),
    ])
    .optional(),
};
const snapshot = z.object({
  title: z.string().max(200),
  slug: z.string().max(120),
  locale: z.string().max(10),
  sections: z.array(section).max(100),
  seo: z.object({
    title: z.string().max(300),
    description: z.string().max(1000),
    keywords: z.string().max(1000),
    image: z.string().max(2000),
    noindex: z.boolean(),
    ...seoExtras,
  }),
  updatedAt: z.string().max(100),
});
const item: z.ZodType<import("./types").MenuItem> = z.lazy(() =>
  z.object({
    id: z.string().max(100),
    label: z.string().max(200),
    pageId: z.string().max(100),
    url: z.string().max(2000),
    children: z.array(item).max(30),
  }),
);
const schema = z.object({
  revision: z.number().int().nonnegative(),
  pages: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        clientAccess: z
          .object({ edit: z.boolean(), publish: z.boolean() })
          .optional(),
        title: z.string().trim().min(1).max(200),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
          .max(120)
          .refine(
            (slug) => !(LOCALES as readonly string[]).includes(slug),
            "A page URL cannot be a language code (lv, ru, en, de).",
          ),
        locale: z.enum(LOCALES),
        translationGroup: z
          .string()
          .regex(/^[a-zA-Z0-9-]{1,100}$/)
          .optional(),
        status: z.enum(["Draft", "Published"]),
        sections: z.array(section).max(100),
        seo: z.object({
          title: z.string().max(300),
          description: z.string().max(1000),
          keywords: z.string().max(1000),
          image: z.string().max(2000),
          noindex: z.boolean(),
          ...seoExtras,
        }),
        updatedAt: z.string().max(100),
        published: snapshot.optional(),
        history: z
          .array(
            snapshot.extend({
              id: z.string().max(100),
              kind: z.enum([
                "Draft saved",
                "Published",
                "Moved to trash",
                "Restored",
              ]),
            }),
          )
          .max(20)
          .optional(),
        deletedAt: z.string().max(100).optional(),
      }),
    )
    .max(200),
  media: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(300),
        url: z.string().max(2000),
        width: z.number(),
        height: z.number(),
        size: z.number(),
        mime: z.string().max(100),
        alt: z.string().max(500),
      }),
    )
    .max(1000),
  menus: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().max(100),
        placement: z.enum(["header", "footer"]).optional(),
        locale: z.enum(LOCALES).optional(),
        items: z.array(item).max(100),
      }),
    )
    .max(20),
  layout: z.object({
    header: section,
    footer: section,
    // Multilingual websites keep one set of menus per language (each menu shows on its language's pages).
    headerMenus: z.array(z.string()).max(12),
    footerMenus: z.array(z.string()).max(12),
    homePageId: z.string().max(100),
    localized: z
      .partialRecord(
        z.enum(LOCALES),
        z.object({
          header: z
            .record(z.string().max(100), z.string().max(20000))
            .refine((v) => Object.keys(v).length <= 1000)
            .optional(),
          footer: z
            .record(z.string().max(100), z.string().max(20000))
            .refine((v) => Object.keys(v).length <= 1000)
            .optional(),
        }),
      )
      .optional(),
  }),
  brand: z.object({
    name: z.string().max(100),
    logo: z.string().max(2000),
    footerLogo: z.string().max(2000),
    primary: z.string().regex(/^#[0-9a-f]{6}$/i),
    secondary: z.string().regex(/^#[0-9a-f]{6}$/i),
    alternative: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  forms: z
    .object({
      enabled: z.boolean(),
      recipient: z.union([z.literal(""), z.email()]),
      successMessage: z.string().min(1).max(500),
      messages: z
        .partialRecord(z.enum(LOCALES), z.string().trim().max(500))
        .optional(),
    })
    .optional(),
  website: z
    .object({
      url: z
        .union([
          z.literal(""),
          z
            .url()
            .max(2000)
            .refine((value) => {
              const url = new URL(value);
              return (
                ["http:", "https:"].includes(url.protocol) &&
                !url.username &&
                !url.password
              );
            }),
        ])
        .transform((value) => value.replace(/\/$/, "")),
      contactEmail: z.union([z.literal(""), z.email()]),
      phone: z.string().max(100),
      address: z.string().max(1000),
      timeZone: z
        .string()
        .max(100)
        .refine((value) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return true;
          } catch {
            return false;
          }
        }, "Choose a valid time zone"),
    })
    .optional(),
  fonts: z.enum(FONT_PAIR_IDS).optional(),
  // Style preset values (lib/builder/style-presets.ts), design roles only.
  style: z
    .object({
      preset: z.string().max(40).optional(),
      surface: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]).optional(),
      muted: z.union([z.literal(""), z.string().regex(/^#[0-9a-f]{6}$/i)]).optional(),
      radius: z.number().int().min(0).max(40).optional(),
      spacing: z.enum(SPACINGS).optional(),
      buttons: z.enum(BUTTON_SHAPES).optional(),
    })
    .optional(),
  languages: z
    .object({
      default: z.enum(LOCALES),
      enabled: z.array(z.enum(LOCALES)).min(1).max(LOCALES.length),
    })
    .refine(
      (l) =>
        l.enabled.includes(l.default) &&
        new Set(l.enabled).size === l.enabled.length,
      "The default language must be one of the enabled languages.",
    )
    .optional(),
  // Website-wide SEO (lib/builder/seo/schema.ts), design roles only.
  seo: siteSeoSchema,
  customCss: z
    .string()
    .max(100000)
    .refine(
      (css) =>
        !/<\/?\s*style|@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(
          css,
        ),
      "Custom CSS cannot contain @import, scripts or style tags.",
    )
    .refine(
      (css) =>
        [...css.matchAll(/url\(\s*['"]?([^'")\s]+)/gi)].every(
          ([, url]) => url.startsWith("/") && !url.startsWith("//"),
        ),
      "Custom CSS may only use images from this website (url(/...)).",
    )
    .optional(),
});
export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function database() {
  if (!process.env.DATABASE_URL) return null;
  const sql = (globalStore.cmsSql ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    prepare: false,
  }));
  globalStore.cmsDatabaseReady ??= sql
    .begin(async (tx) => {
      // Serialize first-run DDL across serverless instances as well as concurrent renders.
      await tx`SELECT pg_advisory_xact_lock(731920041)`;
      await tx`CREATE TABLE IF NOT EXISTS harbstone_project (id text PRIMARY KEY, document jsonb NOT NULL)`;
      await tx`CREATE TABLE IF NOT EXISTS harbstone_bot_nonces (nonce text PRIMARY KEY, expires_at timestamptz NOT NULL)`;
      await tx`INSERT INTO harbstone_project (id, document) VALUES ('default', ${tx.json(seedProject() as unknown as postgres.JSONValue)}) ON CONFLICT DO NOTHING`;
    })
    .then(() => {})
    .catch((error) => {
      globalStore.cmsDatabaseReady = undefined;
      throw error;
    });
  await globalStore.cmsDatabaseReady;
  return sql;
}
export { legacySiteId };
const siteIdPattern = /^[a-z0-9]{1,40}$/;
function validSiteId(siteId: string) {
  if (!siteIdPattern.test(siteId))
    throw new StoreError("Website not found.", 404);
  return siteId;
}
// The first website keeps the storage keys and files used before multi-site support,
// so migrating an existing installation never moves or copies its data.
export function siteDocumentId(
  siteId: string,
  kind: "project" | "submissions" | "smtp",
) {
  validSiteId(siteId);
  if (siteId === legacySiteId) return kind === "project" ? "default" : kind;
  return `${kind === "project" ? "site" : kind}:${siteId}`;
}
export function siteDirectory(siteId: string) {
  validSiteId(siteId);
  return siteId === legacySiteId
    ? dataDirectory
    : path.join(dataDirectory, "sites", siteId);
}
// Local media URL served by /api/builder/media; the first website keeps the legacy form.
export const localMediaUrl = (siteId: string, mediaId: string) =>
  siteId === legacySiteId
    ? `/api/builder/media/${mediaId}`
    : `/api/builder/media/${siteId}/${mediaId}`;
export async function readProject(
  siteId: string = legacySiteId,
): Promise<Project> {
  const sql = await database();
  if (sql) {
    const [row] =
      await sql`SELECT document FROM harbstone_project WHERE id=${siteDocumentId(siteId, "project")}`;
    if (!row) throw new StoreError("Website not found.", 404);
    return normalizeProject(separateLayoutMenus(row.document));
  }
  try {
    return normalizeProject(
      separateLayoutMenus(
        JSON.parse(
          await readFile(
            path.join(siteDirectory(siteId), "project.json"),
            "utf8",
          ),
        ),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (siteId !== legacySiteId)
      throw new StoreError("Website not found.", 404);
    return normalizeProject(seedProject());
  }
}
export async function writeProject(
  input: unknown,
  publishId?: string,
  role: Role = "super-admin",
  options: { autosave?: boolean; restore?: boolean; siteId?: string } = {},
): Promise<Project> {
  const siteId = options.siteId ?? legacySiteId;
  const documentId = siteDocumentId(siteId, "project");
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new StoreError(
      parsed.error.issues[0]?.message || "Invalid project data",
    );
  const next = parsed.data;
  if (
    new Set(next.pages.filter((p) => !p.deletedAt).map((p) => p.slug)).size !==
      next.pages.filter((p) => !p.deletedAt).length ||
    new Set(next.pages.map((p) => p.id)).size !== next.pages.length
  )
    throw new StoreError("Each page needs a unique slug.");
  // A translation group holds at most one active page per language.
  const groups = new Map<string, Set<string>>();
  for (const page of next.pages.filter((p) => !p.deletedAt && p.translationGroup)) {
    const locales = groups.get(page.translationGroup!) ?? new Set<string>();
    if (locales.has(page.locale))
      throw new StoreError(
        "A page can have only one translation per language.",
      );
    locales.add(page.locale);
    groups.set(page.translationGroup!, locales);
  }
  const ids = new Set(next.pages.map((p) => p.id));
  if (!ids.has(next.layout.homePageId))
    throw new StoreError("Choose an existing home page.");
  if (
    next.layout.header.variant.split("-v")[0] !== "header" ||
    next.layout.footer.variant.split("-v")[0] !== "footer"
  )
    throw new StoreError("Invalid site layout");
  const menuIds = new Set(next.menus.map((m) => m.id));
  if (
    [...next.layout.headerMenus, ...next.layout.footerMenus].some(
      (id) => !menuIds.has(id),
    )
  )
    throw new StoreError("Select an existing menu.");
  if (
    next.layout.headerMenus.some((id) => next.layout.footerMenus.includes(id))
  )
    throw new StoreError(
      "Header and footer need independent menus. Reload layout settings.",
    );
  for (const placement of ["header", "footer"] as const) {
    if (
      next.layout[`${placement}Menus`].some(
        (id) =>
          next.menus.find((menu) => menu.id === id)?.placement !== placement,
      )
    )
      throw new StoreError(`Select a ${placement} menu for this navigation.`);
  }
  const prepare = (current: Project): Project => {
    if (current.revision !== next.revision)
      throw new StoreError(
        "Someone saved a newer version. Reload before saving.",
        409,
      );
    if (role === "client") {
      const error = clientProjectError(next, current);
      if (error) throw new StoreError(error, 403);
      const page = current.pages.find((p) => p.id === publishId);
      if (
        publishId &&
        (page?.clientAccess?.edit === false ||
          page?.clientAccess?.publish === false)
      )
        throw new StoreError(
          "Publishing this page is managed by your administrator.",
          403,
        );
    }
    if (
      publishId &&
      !next.pages.some((p) => p.id === publishId && !p.deletedAt)
    )
      throw new StoreError("Choose an active page to publish.");
    for (const page of next.pages.filter((p) => !p.deletedAt)) {
      if (
        next.pages.some(
          (other) =>
            !other.deletedAt &&
            other.id !== page.id &&
            (other.slug === page.slug ||
              (options.restore
                ? other.published?.slug
                : current.pages.find((p) => p.id === other.id)?.published
                    ?.slug) === page.slug),
        )
      )
        throw new StoreError(
          "This URL belongs to another page or its published version.",
        );
      for (const block of page.sections) {
        const entry = definition(block.variant)!;
        for (const [id, items] of Object.entries(block.collections || {})) {
          const group = entry.repeaters?.find((r) => r.id === id);
          if (
            !group ||
            items.length > (group.max ?? 30) ||
            items.some((item) => item.template >= group.items.length) ||
            new Set(items.map((i) => i.id)).size !== items.length
          )
            throw new StoreError("Invalid card collection.");
        }
      }
    }
    const pages = options.restore
      ? next.pages
      : preparePages(next.pages, current.pages, publishId, options.autosave);
    if (pages.find((p) => p.id === next.layout.homePageId)?.deletedAt)
      throw new StoreError(
        "Choose another home page before moving this page to trash.",
      );
    return { ...next, pages, revision: next.revision + 1 };
  };
  const sql = await database();
  if (sql) {
    return (await sql.begin(async (tx) => {
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id=${documentId} FOR UPDATE`;
      if (!row) throw new StoreError("Website not found.", 404);
      const saved = prepare(
        normalizeProject(separateLayoutMenus(row.document)),
      );
      await tx`UPDATE harbstone_project SET document=${tx.json(saved as unknown as postgres.JSONValue)} WHERE id=${documentId}`;
      return saved;
    })) as Project;
  }
  if (process.env.VERCEL)
    throw new StoreError(
      "Connect DATABASE_URL and BLOB_READ_WRITE_TOKEN for persistent hosting storage.",
      503,
    );
  const operation = (globalStore.cmsQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const current = await readProject(siteId);
      const saved = prepare(current);
      const directory = siteDirectory(siteId);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(directory, "project.json.tmp"),
        JSON.stringify(saved),
        { mode: 0o600 },
      );
      await rename(
        path.join(directory, "project.json.tmp"),
        path.join(directory, "project.json"),
      );
      return saved;
    });
  globalStore.cmsQueue = operation;
  return operation;
}
// level: false = any signed-in account, "design" = owner or designer, true = owner only.
export async function authorizeWrite(
  request: Request,
  ownerOnly: boolean | "design" = false,
) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (origin && new URL(origin).host !== host)
    throw new StoreError("Cross-origin writes are not allowed", 403);
  // Local prototyping stays friction-free; hosted writes require the configured session.
  if (
    !localAccess() &&
    process.env.NODE_ENV !== "development" &&
    !authConfigured()
  )
    throw new StoreError(
      "Configure CMS_ADMIN_EMAIL, CMS_ADMIN_PASSWORD (12+ characters) and CMS_AUTH_SECRET (32+ characters).",
      503,
    );
  let identity = ownerIdentity();
  if (!localRequest(request.headers)) {
    const cookie = request.headers.get("cookie") || "";
    const token = cookie
      .split(";")
      .find((c) => c.trim().startsWith("cms_session="))
      ?.trim()
      .slice("cms_session=".length);
    const session = sessionIdentity(token);
    const verified =
      session && session.role !== "super-admin"
        ? await accountIdentity(session.id, session.version)
        : session;
    if (!verified) throw new StoreError("Sign in before editing.", 401);
    identity = verified;
  }
  if (ownerOnly === true && identity.role !== "super-admin")
    throw new StoreError("Only the super admin can access this feature.", 403);
  if (ownerOnly === "design" && identity.role === "client")
    throw new StoreError("Only the design team can access this feature.", 403);
  return identity;
}
// Address used for rate limits. Vercel overwrites the forwarding headers; elsewhere only
// the last x-forwarded-for entry is written by our own proxy, the rest is client-supplied.
export function clientIp(request: Request) {
  const forwarded = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const ip = process.env.VERCEL
    ? request.headers.get("x-real-ip") || forwarded[0]
    : forwarded.at(-1);
  return (ip || "local").slice(0, 64);
}
// Reads a JSON body with a hard size limit that does not rely on Content-Length.
export async function readJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new StoreError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new StoreError("Invalid request data.");
  }
}
export function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof StoreError
          ? error.message
          : "Could not complete this operation.",
    },
    { status: error instanceof StoreError ? error.status : 500 },
  );
}
// Rejects cross-site browser requests to public write endpoints.
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !==
      (request.headers.get("host") || new URL(request.url).host)
  )
    throw new StoreError("Invalid origin.", 403);
}
