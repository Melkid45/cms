import { z } from "zod";
import { errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { catalogLocales, productName, type Product } from "@/lib/builder/products/shared";
import { importProducts, productInput, readCatalog, siteConflict, type ProductInput } from "@/lib/builder/products/store";
import { guessColumn, mergeChange, parseCsv, rowChange, tableColumns } from "@/lib/builder/products/table";
import { readXlsx } from "@/lib/builder/products/xlsx";
export const runtime = "nodejs";

// Catalogue import from CSV or XLSX in three steps, all through this endpoint:
// 1) file only → headers, sample rows and a guessed column mapping;
// 2) file + mapping → dry run: what each row would do (create / update / error), nothing saved;
// 3) file + mapping + apply → rows without errors are saved in one write.
// Rows match existing products by id, then SKU, then the default-language address.
const body = z.object({
  fileName: z.string().max(300),
  data: z.string().max(12_000_000),
  mapping: z.array(z.string().max(80)).max(500).optional(),
  apply: z.boolean().optional(),
});
export async function POST(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const parsed = body.safeParse(await readJson(request, 12_500_000));
    if (!parsed.success) throw new StoreError("Choose a CSV or XLSX file.");
    const { fileName, data, mapping, apply } = parsed.data;
    const rows = /\.xlsx$/i.test(fileName) ? readXlsx(Buffer.from(data, "base64")) : parseCsv(data);
    if (rows.length < 2) throw new StoreError("The file needs a header row and at least one product row.");
    if (rows.length > 2001) throw new StoreError("Up to 2000 products per import.");
    const [catalog, project] = await Promise.all([readCatalog(site.id), readProject(site.id)]);
    const locales = catalogLocales(project);
    const columns = tableColumns(locales, catalog.settings.filters.map((f) => f.key));
    const [headers, ...lines] = rows;
    if (!mapping)
      return Response.json({
        headers,
        columns,
        mapping: headers.map((h) => guessColumn(h, columns, locales[0])),
        sample: lines.slice(0, 5),
        total: lines.length,
      });
    const map = headers.map((_, i) => (columns.includes(mapping[i] || "") ? mapping[i] : ""));
    const seen = new Map<string, number>();
    const simulated = { ...catalog, products: catalog.products.slice() };
    const valid: { id?: string; input: ProductInput }[] = [];
    const preview = lines.map((line, n) => {
      const change = rowChange(line, map, locales[0]);
      const base: Product | undefined =
        (change.match.id && catalog.products.find((p) => p.id === change.match.id)) ||
        (change.match.sku && catalog.products.find((p) => p.sku === change.match.sku)) ||
        (change.match.slug && catalog.products.find((p) => p.text[locales[0] as keyof Product["text"]]?.slug === change.match.slug)) ||
        undefined;
      const errors = [...change.errors];
      if (change.match.id && !base) errors.push(`no product with id ${change.match.id}`);
      const merged = mergeChange(base, change);
      const result = productInput.safeParse(merged);
      if (!result.success) errors.push(...result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`));
      else {
        const id = base?.id ?? `row-${n}`;
        for (const t of Object.values(result.data.text)) {
          if (!t) continue;
          const other = seen.get(t.slug);
          if (other !== undefined && other !== n) errors.push(`address "${t.slug}" repeats row ${other + 2}`);
          seen.set(t.slug, n);
        }
        const conflict = siteConflict(result.data, id, simulated, project);
        if (conflict) errors.push(conflict);
        if (!errors.length) valid.push({ id: base?.id, input: result.data });
      }
      return {
        row: n + 2,
        action: errors.length ? "error" : base ? "update" : "create",
        name: productName({ ...(merged as unknown as Product), id: base?.id || "" }, locales[0]),
        sku: merged.sku,
        price: merged.price,
        errors,
      };
    });
    const summary = {
      create: preview.filter((p) => p.action === "create").length,
      update: preview.filter((p) => p.action === "update").length,
      error: preview.filter((p) => p.action === "error").length,
    };
    if (!apply) return Response.json({ preview, summary });
    const saved = valid.length ? await importProducts(site.id, valid, project) : { created: 0, updated: 0 };
    return Response.json({ preview, summary, saved });
  } catch (error) {
    return errorResponse(error);
  }
}
