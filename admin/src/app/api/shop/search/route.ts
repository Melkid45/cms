import { z } from "zod";
import { errorResponse, StoreError } from "@/lib/builder/server";
import { readSiteProject } from "@/lib/builder/products/public";
import { readRegistry } from "@/lib/builder/sites";
import { definition } from "@/lib/builder/catalog";
import { collectionItems } from "@/lib/builder/collections";
import { sitePath } from "@/lib/builder/site-links";
export const runtime = "nodejs";

// Read-only search index of a website for the search pop-up (contact-v27): published pages
// (title, address, description) and the product cards of shop grids (pricing-v20/v21:
// title, specs, price, photo, link). Only content that is already public.
const CARD_VARIANTS = ["pricing-v20", "pricing-v21"];
export async function GET(request: Request) {
  try {
    const siteId = z
      .string()
      .regex(/^[a-z0-9]{1,40}$/)
      .safeParse(new URL(request.url).searchParams.get("site") || "");
    if (!siteId.success) throw new StoreError("Not found.", 404);
    const entry = (await readRegistry()).sites.find((s) => s.id === siteId.data);
    if (!entry) throw new StoreError("Not found.", 404);
    // Catalogue products included (lib/builder/products).
    const project = await readSiteProject(entry.id, entry.key);
    const pages = project.pages.filter((p) => p.published && !p.deletedAt && !p.published.seo?.noindex);
    const products = new Map<string, { title: string; specs: string[]; price: string; old: string; image: string; url: string; locale: string }>();
    for (const page of pages)
      for (const section of page.published!.sections) {
        if (!CARD_VARIANTS.includes(section.variant) || section.hidden) continue;
        const def = definition(section.variant);
        const group = def?.repeaters?.[0];
        if (!def || !group) continue;
        for (const item of collectionItems(section, def, group)) {
          // Card fields in template order: link, photo, alt, badge, tag, title, 4 × (label, value), price, old price, …
          const f = group.items[item.template]?.fields || [];
          const v = (i: number) => String(item.values[f[i]] ?? "").trim();
          const url = v(0), title = v(5);
          if (!title || !url || products.has(url)) continue;
          products.set(url, {
            title,
            specs: [7, 9, 11, 13].map(v).filter(Boolean),
            price: v(14),
            old: v(15),
            image: v(1),
            url,
            locale: page.published!.locale,
          });
        }
      }
    return Response.json(
      {
        products: [...products.values()].slice(0, 500),
        pages: pages
          .map((p) => ({
            title: p.published!.title,
            text: p.published!.seo?.description || "",
            url: sitePath(entry.key, p.published!.slug),
            locale: p.published!.locale,
          }))
          .filter((p) => !products.has(p.url))
          .slice(0, 300),
      },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
