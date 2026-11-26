import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { z } from "zod";
import {
  authorizeWrite,
  database,
  dataDirectory,
  legacySiteId,
  readProject,
  siteDirectory,
  siteDocumentId,
  StoreError,
} from "./server";
import { seedProject } from "./seed";
import { canAccessSite, type AccessScope, type Identity } from "./access";
import { siteCookie, siteKeyPattern } from "./site-links";
import type { Project } from "./types";

export interface Company {
  id: string;
  name: string;
  createdAt: string;
  // Shown first in the studio clients list (owner's real clients).
  pinned?: boolean;
}
export interface Site {
  id: string;
  companyId: string;
  // URL-safe public key: /site/{key}/{slug}
  key: string;
  name: string;
  createdAt: string;
}
export interface Registry {
  revision: number;
  companies: Company[];
  sites: Site[];
}
export { siteCookie };
const registryId = "companies";
const globalSites = globalThis as typeof globalThis & {
  sitesQueue?: Promise<unknown>;
};
// Cyrillic names get readable addresses instead of an empty key.
const cyrillic: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ґ: "g",
  д: "d",
  е: "e",
  ё: "e",
  є: "ye",
  ж: "zh",
  з: "z",
  и: "i",
  і: "i",
  ї: "yi",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
export function slugifyKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[а-яёєіїґ]/g, (letter) => cyrillic[letter] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
// Migration: an installation without a registry becomes company 1 / site 1. Both use
// the fixed id "default", whose storage keys are the pre-multi-site ones, so nothing moves.
async function initialRegistry(): Promise<Registry> {
  let name = "My website";
  try {
    name = (await readProject(legacySiteId)).brand.name.trim() || name;
  } catch {}
  const createdAt = new Date().toISOString();
  return {
    revision: 0,
    companies: [{ id: legacySiteId, name, createdAt }],
    sites: [
      {
        id: legacySiteId,
        companyId: legacySiteId,
        key: slugifyKey(name) || "main",
        name,
        createdAt,
      },
    ],
  };
}
async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
  await rename(file + ".tmp", file);
}
const registryFile = () => path.join(dataDirectory, "companies.json");
async function localRegistry(): Promise<Registry> {
  try {
    return JSON.parse(await readFile(registryFile(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const data = await initialRegistry();
    // Hosted without storage: public pages still render the first website read-only.
    if (!process.env.VERCEL) await writeJson(registryFile(), data);
    return data;
  }
}
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const operation = (globalSites.sitesQueue ?? Promise.resolve())
    .catch(() => {})
    .then(fn);
  globalSites.sitesQueue = operation;
  return operation;
}
export async function readRegistry(): Promise<Registry> {
  const sql = await database();
  if (sql) {
    const [row] =
      await sql`SELECT document FROM harbstone_project WHERE id=${registryId}`;
    if (row) return row.document as Registry;
    await sql`INSERT INTO harbstone_project(id,document) VALUES (${registryId}, ${sql.json((await initialRegistry()) as unknown as postgres.JSONValue)}) ON CONFLICT DO NOTHING`;
    const [created] =
      await sql`SELECT document FROM harbstone_project WHERE id=${registryId}`;
    return created.document as Registry;
  }
  return queued(localRegistry);
}
type CreateProject = (siteId: string, project: Project) => Promise<void>;
// Locked registry update. createProject stores a new website's document in the same
// transaction (PostgreSQL) or before the registry file is replaced (local storage).
async function updateRegistry<T>(
  fn: (data: Registry, createProject: CreateProject) => T | Promise<T>,
): Promise<T> {
  const sql = await database();
  if (sql) {
    await readRegistry();
    return (await sql.begin(async (tx) => {
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id=${registryId} FOR UPDATE`;
      const data = row.document as Registry;
      const result = await fn(data, async (siteId, project) => {
        const rows =
          await tx`INSERT INTO harbstone_project(id,document) VALUES (${siteDocumentId(siteId, "project")}, ${tx.json(project as unknown as postgres.JSONValue)}) ON CONFLICT DO NOTHING RETURNING id`;
        if (!rows.length)
          throw new StoreError("This website already exists.", 409);
      });
      data.revision++;
      await tx`UPDATE harbstone_project SET document=${tx.json(data as unknown as postgres.JSONValue)} WHERE id=${registryId}`;
      return result;
    })) as T;
  }
  if (process.env.VERCEL)
    throw new StoreError(
      "Connect DATABASE_URL for persistent hosting storage.",
      503,
    );
  return queued(async () => {
    const data = await localRegistry();
    const result = await fn(data, async (siteId, project) => {
      await writeJson(
        path.join(siteDirectory(siteId), "project.json"),
        project,
      );
    });
    data.revision++;
    await writeJson(registryFile(), data);
    return result;
  });
}
export const companyInput = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export const siteInput = z
  .object({
    companyId: z.string().regex(/^[a-z0-9]{1,40}$/),
    name: z.string().trim().min(1).max(100),
    key: z.string().max(60).regex(siteKeyPattern).optional(),
    copyFrom: z
      .string()
      .regex(/^[a-z0-9]{1,40}$/)
      .optional(),
  })
  .strict();
const newId = () => randomUUID().replaceAll("-", "").slice(0, 12);
export async function createCompany(input: z.infer<typeof companyInput>) {
  return updateRegistry((data) => {
    if (data.companies.length >= 200)
      throw new StoreError("Company limit reached.");
    const company: Company = {
      id: newId(),
      name: input.name,
      createdAt: new Date().toISOString(),
    };
    data.companies.push(company);
    return company;
  });
}
export const companyRename = z
  .object({
    id: z.string().regex(/^[a-z0-9]{1,40}$/),
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export const companyPin = z
  .object({
    id: z.string().regex(/^[a-z0-9]{1,40}$/),
    pinned: z.boolean(),
  })
  .strict();
export async function pinCompany(input: z.infer<typeof companyPin>) {
  return updateRegistry((data) => {
    const company = data.companies.find((item) => item.id === input.id);
    if (!company) throw new StoreError("Choose an existing company.", 404);
    if (input.pinned) company.pinned = true;
    else delete company.pinned;
    return company;
  });
}
export async function renameCompany(input: z.infer<typeof companyRename>) {
  return updateRegistry((data) => {
    const company = data.companies.find((item) => item.id === input.id);
    if (!company) throw new StoreError("Choose an existing company.", 404);
    company.name = input.name;
    return company;
  });
}
// Rewrites internal links of a copied website to its own public key. Legacy one-segment
// links (/site/{slug}, optionally with ?query or #fragment) are rewritten only when the
// segment is a page of the source website, so links to other websites stay intact.
function relink<T>(
  value: T,
  from: Site,
  to: string,
  legacySlugs: Set<string> | null,
): T {
  if (typeof value === "string") {
    if (value.startsWith(`/site/${from.key}/`))
      return `/site/${to}/${value.slice(from.key.length + 7)}` as T;
    const short = /^\/site\/([a-z0-9-]+)([?#].*)?$/.exec(value);
    if (short?.[1] === from.key) return `/site/${to}${short[2] ?? ""}` as T;
    if (short && legacySlugs?.has(short[1]))
      return `/site/${to}/${short[1]}${short[2] ?? ""}` as T;
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => relink(item, from, to, legacySlugs)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        relink(v, from, to, legacySlugs),
      ]),
    ) as T;
  return value;
}
// Looks a website up by id first, then by public key, so a key can never shadow an id.
export function findSite(registry: Registry, value: string) {
  return (
    registry.sites.find((site) => site.id === value) ??
    registry.sites.find((site) => site.key === value)
  );
}
export async function createSite(input: z.infer<typeof siteInput>) {
  const registry = await readRegistry();
  const source = input.copyFrom
    ? registry.sites.find((site) => site.id === input.copyFrom)
    : undefined;
  if (input.copyFrom && !source)
    throw new StoreError("Choose an existing website to copy.", 404);
  const sourceProject = source ? await readProject(source.id) : undefined;
  // One-segment /site/{slug} links of the first website must not be shadowed by a key.
  const primary = primarySite(registry);
  const primaryProject = !primary
    ? undefined
    : source?.id === primary.id
      ? sourceProject
      : await readProject(primary.id);
  const reserved = new Set(primaryProject?.pages.map((page) => page.slug));
  return updateRegistry(async (data, createProject) => {
    if (!data.companies.some((company) => company.id === input.companyId))
      throw new StoreError("Choose an existing company.", 404);
    if (data.sites.length >= 500)
      throw new StoreError("Website limit reached.");
    // Keys share the ?site= namespace with ids and /site/{x} with the first website's pages.
    const taken = (value: string) =>
      value === legacySiteId ||
      /^[a-f0-9]{12}$/.test(value) ||
      reserved.has(value) ||
      data.sites.some((site) => site.key === value || site.id === value);
    const base = input.key || slugifyKey(input.name) || "site";
    let key = base;
    if (input.key && taken(key))
      throw new StoreError("This website address is already used.", 409);
    for (let i = 2; taken(key); i++) key = `${base.slice(0, 55)}-${i}`;
    const site: Site = {
      id: newId(),
      companyId: input.companyId,
      key,
      name: input.name,
      createdAt: new Date().toISOString(),
    };
    let project: Project;
    if (source && sourceProject) {
      project = relink(
        sourceProject,
        source,
        key,
        source.id === legacySiteId
          ? new Set(sourceProject.pages.map((page) => page.slug))
          : null,
      );
      project.revision = 0;
      // A copy is a new website: its own name, nothing live yet, and no enquiries or
      // canonical URLs tied to the source website.
      project.brand.name = input.name;
      project.pages = project.pages.map((page) => {
        const { published, history, ...draft } = page;
        void published;
        void history;
        return { ...draft, status: "Draft" as const };
      });
      if (project.forms) project.forms.recipient = "";
      if (project.website) project.website.url = "";
    } else {
      project = seedProject(key);
      project.brand.name = input.name;
    }
    await createProject(site.id, project);
    data.sites.push(site);
    return site;
  });
}
export async function siteByKey(key: string) {
  return (await readRegistry()).sites.find((site) => site.key === key);
}
// The first website answers legacy /site/{slug} links and unscoped bot requests.
export function primarySite(registry: Registry) {
  return (
    registry.sites.find((site) => site.id === legacySiteId) ?? registry.sites[0]
  );
}
export function workspace(registry: Registry, identity: Identity) {
  const sites = registry.sites.filter((site) => canAccessSite(identity, site));
  const companies = registry.companies.filter(
    (company) =>
      identity.role === "super-admin" ||
      identity.scope?.companies.includes(company.id) ||
      sites.some((site) => site.companyId === company.id),
  );
  return { companies, sites };
}
// Explicit requests (query/header) must be allowed; a remembered cookie silently falls
// back to the first allowed website.
export async function resolveSite(
  identity: Identity,
  requested?: string | null,
  remembered?: string | null,
) {
  const registry = await readRegistry();
  const { sites } = workspace(registry, identity);
  if (requested) {
    const site = findSite(registry, requested);
    if (!site) throw new StoreError("Website not found.", 404);
    if (!sites.includes(site))
      throw new StoreError("You do not have access to this website.", 403);
    return { site, registry };
  }
  const site = sites.find((item) => item.id === remembered) ?? sites[0];
  if (!site)
    throw new StoreError("No website is assigned to your account.", 403);
  return { site, registry };
}
export function cookieValue(request: Request, name: string) {
  const value = (request.headers.get("cookie") || "")
    .split(";")
    .find((c) => c.trim().startsWith(name + "="))
    ?.trim()
    .slice(name.length + 1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed cookie is ignored like a missing one.
    return undefined;
  }
}
// Authorizes a request and selects its website: ?site= or x-cms-site, then the cms_site cookie.
export async function authorizeSite(
  request: Request,
  ownerOnly: boolean | "design" = false,
) {
  const identity = await authorizeWrite(request, ownerOnly);
  const requested =
    new URL(request.url).searchParams.get("site") ||
    request.headers.get("x-cms-site");
  const { site } = await resolveSite(
    identity,
    requested,
    cookieValue(request, siteCookie),
  );
  return { identity, site };
}
// Drops ids that are not in the registry before an access scope is stored.
// New client accounts always store an explicit scope. Without one they get the only
// website of a single-website installation, and nothing once there are several.
export async function newAccountScope<T extends { scope?: AccessScope }>(
  input: T,
) {
  if (input.scope) return knownScope(input);
  const { sites } = await readRegistry();
  return {
    ...input,
    scope: { companies: [], sites: sites.length === 1 ? [sites[0].id] : [] },
  };
}
export async function knownScope<T extends { scope?: AccessScope }>(input: T) {
  if (!input.scope) return input;
  const registry = await readRegistry();
  return {
    ...input,
    scope: {
      companies: input.scope.companies.filter((id) =>
        registry.companies.some((company) => company.id === id),
      ),
      sites: input.scope.sites.filter((id) =>
        registry.sites.some((site) => site.id === id),
      ),
    },
  };
}
