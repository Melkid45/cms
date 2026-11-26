import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { head, put } from "@vercel/blob";
import { siteDirectory, StoreError } from "../server";
import { readPublicProject } from "../products/public";
import { FONT_PAIRS } from "../font-pairs";
import { mediaBytes } from "../social/render";
import { pageHref } from "../i18n";
import type { Project } from "../types";
import { pageContent } from "./content";
import { primaryDomain } from "../domains/store";
import { DOMAIN_HEADER, rootedHref, SITE_HEADER } from "../domains/names";

// Indexable only on the website's own production address: the request host equals the host
// of its Website URL setting. Tunnel copies (*.trycloudflare.com), 127.0.0.1 and any other host
// (e.g. the CMS admin host when it is not the Website URL) get noindex + robots disallow.
export function productionHost(project: Pick<Project, "website">, headers: Headers) {
  const url = project.website?.url;
  if (!url) return false;
  const host = (headers.get("x-forwarded-host") || headers.get("host") || "").split(",")[0].trim().toLowerCase();
  try {
    return new URL(url).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
export const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex, nofollow" };
// Public base URL of a website: its Website URL setting, else NEXT_PUBLIC_SITE_URL, else the
// address the request came in on (tunnel / local). See BUILDER.md → SEO → custom domains.
export function publicBase(project: Pick<Project, "website">, headers: Headers) {
  const set = project.website?.url || process.env.NEXT_PUBLIC_SITE_URL;
  if (set) return set.replace(/\/$/, "");
  const host = (headers.get("x-forwarded-host") || headers.get("host") || "localhost").split(",")[0].trim();
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
export const absoluteWith = (base: string) => (value: string) => {
  try {
    return new URL(value, base + "/").toString();
  } catch {
    return value;
  }
};
// Public address of a website, custom domains included (BUILDER.md → Custom domains).
// A verified primary domain replaces the Website URL setting: productionHost/publicBase then see
// https://{domain}, and absolute URLs drop the /site/{key} prefix (https://zcena.com/ru/katalogs).
// `link` maps in-page links: rooted only when this request came in on the domain itself.
export async function siteAddress<P extends Pick<Project, "website" | "pages" | "layout" | "languages">>(
  site: { id: string; key: string },
  project: P,
  headers: Headers,
) {
  const domain = await primaryDomain(site.id);
  const effective: P = domain
    ? { ...project, website: { ...(project.website ?? {}), url: `https://${domain}` } as P["website"] }
    : project;
  const base = publicBase(effective, headers);
  const onDomain = !!domain && headers.get(SITE_HEADER) === site.key && !!headers.get(DOMAIN_HEADER);
  const root = (href: string) => rootedHref(project, site.key, href);
  return {
    domain,
    base,
    onDomain,
    project: effective,
    // Indexable only on the production address (the domain, else the Website URL host).
    live: productionHost(effective, headers),
    absolute: (href: string) => absoluteWith(base)(domain ? root(href) : href),
    link: (href: string) => (onDomain ? root(href) : href),
  };
}

// ------------------------------------------------------------------ auto OG images
const OG = { width: 1200, height: 630 };
const SERIF = /playfair|cormorant|lora|serif|dm-serif/;
const escapeXml = (value: string) => value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fontName = (variable: string) =>
  variable
    .replace(/^--font-/, "")
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
    .replace(/^Pt /, "PT ")
    .replace(/^Dm /, "DM ");
function wrap(text: string, max: number, lines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return out;
}
type OgPage = { id: string; title: string; locale: string; seo: { title: string; ogTitle?: string; image: string }; sections: Project["pages"][number]["sections"]; updatedAt: string };
const ogTitle = (page: OgPage) => (page.seo.ogTitle || page.seo.title || page.title).trim();
// The key changes with everything the picture shows, so publishing a changed page
// (new published updatedAt / title / hero) produces a new image.
export function ogKey(project: Project, page: OgPage) {
  const hero = pageContent(page.sections).heroImage;
  return createHash("sha256")
    .update(
      JSON.stringify([2, ogTitle(page), hero, project.brand, project.fonts, page.updatedAt]),
    )
    .digest("hex")
    .slice(0, 20);
}
export async function renderOg(siteId: string, project: Project, page: OgPage) {
  const { width: W, height: H } = OG;
  const pair = FONT_PAIRS.find((p) => p.id === project.fonts) ?? FONT_PAIRS[0];
  const headingFamily = `${escapeXml(fontName(pair.heading))}, ${SERIF.test(pair.heading) ? "Georgia, serif" : "Arial, sans-serif"}`;
  const bodyFamily = `${escapeXml(fontName(pair.body))}, Arial, sans-serif`;
  const hero = pageContent(page.sections).heroImage;
  let photo: Buffer | null = null;
  if (hero)
    try {
      photo = await sharp(await mediaBytes(siteId, hero), { limitInputPixels: 40000000 })
        .rotate()
        .resize(W, H, { fit: "cover", position: "attention" })
        .toBuffer();
    } catch {
      photo = null;
    }
  const ink = project.brand.primary || "#111111";
  const paper = project.brand.secondary || "#ffffff";
  const accent = project.brand.alternative || ink;
  const fg = photo ? "#ffffff" : ink;
  const title = wrap(ogTitle(page), 26, 3);
  const size = title.length > 2 ? 62 : 70;
  const lineHeight = Math.round(size * 1.12);
  const top = H - 120 - lineHeight * (title.length - 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.25" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient></defs>
${photo ? `<rect width="100%" height="100%" fill="url(#g)"/>` : ""}
<rect x="72" y="${top - size - 34}" width="72" height="8" rx="4" fill="${escapeXml(accent)}"/>
${title
  .map(
    (line, i) =>
      `<text x="72" y="${top + i * lineHeight}" font-family="${headingFamily}" font-weight="${pair.weight}" font-size="${size}" fill="${escapeXml(fg)}">${escapeXml(line)}</text>`,
  )
  .join("\n")}
<text x="72" y="${H - 54}" font-family="${bodyFamily}" font-size="26" fill="${escapeXml(fg)}" fill-opacity="0.85">${escapeXml(project.brand.name)}</text>
</svg>`;
  const base = photo
    ? sharp(photo)
    : sharp({ create: { width: W, height: H, channels: 3, background: paper } });
  return base
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}
const memory = new Map<string, Buffer>();
// Cached OG image of a published page: { url } (Blob) or { bytes } (local storage).
export async function ogImage(siteId: string, pageId: string) {
  const project = await readPublicProject(siteId);
  const page = project.pages.find((p) => p.id === pageId);
  if (!page) throw new StoreError("Page not found.", 404);
  const key = ogKey(project, page);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const pathname = `cms-og/${siteId}/${pageId}-${key}.jpg`;
    try {
      return { url: (await head(pathname)).url };
    } catch {
      const blob = await put(pathname, await renderOg(siteId, project, page), {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { url: blob.url };
    }
  }
  const cached = memory.get(key);
  if (cached) return { bytes: cached };
  const file = path.join(siteDirectory(siteId), "og", `${pageId}-${key}.jpg`);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    bytes = await renderOg(siteId, project, page);
    if (!process.env.VERCEL) {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, bytes, { mode: 0o600 });
    }
  }
  if (memory.size > 200) memory.clear();
  memory.set(key, bytes);
  return { bytes };
}
// Public address of a page's OG image (used in metadata when the page has no own image).
export const ogPath = (siteId: string, page: { id: string; updatedAt: string }) =>
  `/api/seo/og/${siteId}/${page.id}.jpg?v=${encodeURIComponent(page.updatedAt.replace(/\D/g, "").slice(0, 14))}`;
// Pre-renders the image right after publishing, so the first share is fast.
export async function warmOg(siteId: string, pageId: string) {
  try {
    await ogImage(siteId, pageId);
  } catch {
    // rendered on first request instead
  }
}

// ------------------------------------------------------------------ sitemap / robots data
export function sitemapEntries(project: Project, siteKey: string, absolute: (p: string) => string) {
  const url = (p: Project["pages"][number]) => absolute(pageHref(project, siteKey, p));
  // A page whose canonical points elsewhere is a duplicate: not listed.
  const listed = (p: Project["pages"][number]) =>
    !p.seo.noindex && (!p.seo.canonical || p.seo.canonical === url(p));
  const languages = project.languages;
  return project.pages.filter(listed).map((page) => {
    const group = page.translationGroup
      ? project.pages.filter((p) => p.translationGroup === page.translationGroup && listed(p))
      : [];
    const fallback = group.find((p) => p.locale === languages?.default);
    return {
      loc: url(page),
      lastmod: page.updatedAt,
      alternates:
        group.length > 1
          ? [
              ...group.map((p) => ({ lang: p.locale, href: url(p) })),
              ...(fallback ? [{ lang: "x-default", href: url(fallback) }] : []),
            ]
          : [],
      home: page.id === project.layout.homePageId,
    };
  });
}
