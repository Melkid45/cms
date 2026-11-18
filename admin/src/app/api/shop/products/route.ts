import {
  authorizeWrite,
  errorResponse,
  readProject,
  StoreError,
} from "@/lib/builder/server";
import { listProducts, saveProduct } from "@/lib/shop/products";

export const runtime = "nodejs";
async function authorize(request: Request) {
  await authorizeWrite(request, true);
  if (!(await readProject()).store?.enabled)
    throw new StoreError("Enable Online store first.", 403);
}
export async function GET(request: Request) {
  try {
    await authorize(request);
    return Response.json(await listProducts(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    await authorize(request);
    const input = await request.json().catch(() => {
      throw new StoreError("Invalid product data.", 400);
    });
    return Response.json(await saveProduct(input));
  } catch (error) {
    return errorResponse(error);
  }
}
