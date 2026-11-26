import { errorResponse, readProject } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { readCatalog } from "@/lib/builder/products/store";
import { catalogLocales } from "@/lib/builder/products/shared";
import { productRow, tableColumns, toCsv } from "@/lib/builder/products/table";
export const runtime = "nodejs";

// CSV of the whole catalogue (UTF-8 with BOM), the same columns the import understands.
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const [catalog, project] = await Promise.all([readCatalog(site.id), readProject(site.id)]);
    const columns = tableColumns(catalogLocales(project), catalog.settings.filters.map((f) => f.key));
    const csv = toCsv([columns, ...catalog.products.map((p) => productRow(p, columns))]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="catalog-${site.key}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
