import { currencySymbol } from "@/lib/builder/commerce-settings";
import { readCommerceSettings } from "@/lib/builder/commerce-store";
import { z } from "zod";
import {
  errorResponse,
  readJson,
  readProject,
  StoreError,
} from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { PRODUCT_BLOCK } from "@/lib/builder/products/apply";
import { catalogLocales } from "@/lib/builder/products/shared";
import {
  createProduct,
  deleteProducts,
  patchProduct,
  productInput,
  quickPatch,
  readCatalog,
  updateProduct,
} from "@/lib/builder/products/store";
export const runtime = "nodejs";

// Product catalogue of the selected website (Dashboard → Catalog). Products are shop content:
// the super admin, the website's designers and its client may manage them (no customer data here).
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const [catalog, project] = await Promise.all([
      readCatalog(site.id),
      readProject(site.id),
    ]);
    const commerce = await readCommerceSettings(site.id);
    if (commerce.revision)
      catalog.settings = {
        ...catalog.settings,
        priceFormat: `{n} ${currencySymbol(commerce.currency)}`,
      };
    return Response.json(
      {
        catalog,
        pageAddresses: project.pages.filter(p => !p.deletedAt).map(p => ({id:p.id, slug:p.slug, locale:p.locale})),
        currency: commerce.currency,
        siteKey: site.key,
        languages: project.languages ?? null,
        locales: catalogLocales(project),
        // Pages with a product block: own product pages and templates.
        productPages: project.pages
          .filter(
            (p) =>
              !p.deletedAt &&
              (p.published || p).sections.some(
                (s) => s.variant === PRODUCT_BLOCK,
              ),
          )
          .map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.published?.slug || p.slug,
            locale: p.locale,
            published: !!p.published,
          })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new StoreError(
      issue
        ? `${issue.path.join(" › ")}${issue.path.length ? ": " : ""}${issue.message}`
        : "Check the product fields.",
    );
  }
  return result.data;
};
export async function POST(request: Request) {
  try {
    const { site, identity } = await authorizeSite(request);
    const input = parse(productInput, await readJson(request, 200_000));
    // Which pages show a product is part of the website's design.
    if (identity.role === "client") input.pages = {};
    return Response.json(
      await createProduct(site.id, input, await readProject(site.id)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const { site, identity } = await authorizeSite(request);
    const body = parse(
      z.object({
        id: z.string().min(1).max(40),
        revision: z.number().int().nonnegative(),
        product: z.unknown(),
      }),
      await readJson(request, 200_000),
    );
    const input = parse(productInput, body.product);
    if (identity.role === "client")
      input.pages =
        (await readCatalog(site.id)).products.find((p) => p.id === body.id)
          ?.pages ?? {};
    return Response.json(
      await updateProduct(
        site.id,
        body.id,
        body.revision,
        input,
        await readProject(site.id),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return Response.json(
      await patchProduct(
        site.id,
        parse(quickPatch.strict(), await readJson(request, 4000)),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const { ids } = parse(
      z
        .object({ ids: z.array(z.string().min(1).max(40)).min(1).max(2000) })
        .strict(),
      await readJson(request, 100_000),
    );
    return Response.json(await deleteProducts(site.id, ids));
  } catch (error) {
    return errorResponse(error);
  }
}
