import "server-only";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { authConfigured, localAccess, verifySession } from "./auth";
import postgres from "postgres";
import { z } from "zod";
import { seedProject } from "./seed";
import { definition } from "./catalog";
import { separateLayoutMenus } from "./menus";
import { normalizeProject, preparePages } from "./workflows";
import type { Project } from "./types";

export const dataDirectory = path.resolve(process.cwd(), ".data");
const globalStore = globalThis as typeof globalThis & {
  cmsQueue?: Promise<unknown>;
  cmsSql?: ReturnType<typeof postgres>;
  cmsDatabaseReady?: Promise<void>;
};
const section = z.object({
  id: z.string().min(1).max(100),
  variant: z.string().refine((id) => !!definition(id), "Unknown variation"),
  values: z
    .record(z.string(), z.string().max(20000))
    .refine((v) => Object.keys(v).length <= 1000),
  hidden: z.boolean().optional(),
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
        .max(30),
    )
    .optional(),
});
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
        title: z.string().trim().min(1).max(200),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
          .max(120),
        locale: z.enum(["en", "ru", "de"]),
        status: z.enum(["Draft", "Published"]),
        sections: z.array(section).max(100),
        seo: z.object({
          title: z.string().max(300),
          description: z.string().max(1000),
          keywords: z.string().max(1000),
          image: z.string().max(2000),
          noindex: z.boolean(),
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
        items: z.array(item).max(100),
      }),
    )
    .max(20),
  layout: z.object({
    header: section,
    footer: section,
    headerMenus: z.array(z.string()).max(6),
    footerMenus: z.array(z.string()).max(6),
    homePageId: z.string().max(100),
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
    })
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
export async function readProject(): Promise<Project> {
  const sql = await database();
  if (sql) {
    const [row] =
      await sql`SELECT document FROM harbstone_project WHERE id='default'`;
    return normalizeProject(separateLayoutMenus(row.document));
  }
  try {
    return normalizeProject(
      separateLayoutMenus(
        JSON.parse(
          await readFile(path.join(dataDirectory, "project.json"), "utf8"),
        ),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return normalizeProject(seedProject());
  }
}
export async function writeProject(
  input: unknown,
  publishId?: string,
): Promise<Project> {
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
              current.pages.find((p) => p.id === other.id)?.published?.slug ===
                page.slug),
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
            items.some((item) => item.template >= group.items.length) ||
            new Set(items.map((i) => i.id)).size !== items.length
          )
            throw new StoreError("Invalid card collection.");
        }
      }
    }
    const pages = preparePages(next.pages, current.pages, publishId);
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
        await tx`SELECT document FROM harbstone_project WHERE id='default' FOR UPDATE`;
      const saved = prepare(
        normalizeProject(separateLayoutMenus(row.document)),
      );
      await tx`UPDATE harbstone_project SET document=${tx.json(saved as unknown as postgres.JSONValue)} WHERE id='default'`;
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
      const current = await readProject();
      const saved = prepare(current);
      await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(dataDirectory, "project.json.tmp"),
        JSON.stringify(saved),
        { mode: 0o600 },
      );
      await rename(
        path.join(dataDirectory, "project.json.tmp"),
        path.join(dataDirectory, "project.json"),
      );
      return saved;
    });
  globalStore.cmsQueue = operation;
  return operation;
}
export function authorizeWrite(request: Request) {
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
  if (!localAccess()) {
    const cookie = request.headers.get("cookie") || "";
    const token = cookie
      .split(";")
      .find((c) => c.trim().startsWith("cms_session="))
      ?.trim()
      .slice("cms_session=".length);
    if (!verifySession(token))
      throw new StoreError("Sign in before editing.", 401);
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
