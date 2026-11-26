import { cartVariants } from "@/lib/builder/types";
import { CartPreview } from "./cart-preview";
import "@/components/builder/site.scss";

export const metadata = { robots: { index: false, follow: false } };
export default async function CartPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string }>;
}) {
  const { layout } = await searchParams;
  const selected = cartVariants.find((variant) => variant === layout);
  return (
    <main className="site-canvas container section-stack" style={{ paddingBlock: 48 }}>
      <div className="section__content">
        <h1 className="heading heading--lg">Cart layouts</h1>
        <p className="text text--md text--muted">
          Open each layout to see how the cart appears on a shop website.
        </p>
      </div>
      <CartPreview initial={selected} />
    </main>
  );
}
