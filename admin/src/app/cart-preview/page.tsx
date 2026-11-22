import { Cart } from "@/components/builder/cart";
import { cartVariants } from "@/lib/builder/types";
import "@/components/builder/site.scss";

const names = [
  "Side drawer",
  "Centred dialog",
  "Bottom sheet",
  "Wide dialog",
  "Full screen",
];

export const metadata = { robots: { index: false, follow: false } };
export default async function CartPreview({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string }>;
}) {
  const { layout } = await searchParams;
  const selected = cartVariants.find((variant) => variant === layout);
  const variants = selected ? [selected] : cartVariants;
  return (
    <main className="site-canvas container section-stack">
      <div className="section__content">
        <h1 className="heading heading--lg">Cart collection</h1>
        <p className="text text--md text--muted">
          Add sample products and open the bag to try each layout.
        </p>
      </div>
      {variants.map((variant) => (
        <section key={variant} className="section__content">
          <h2 className="heading heading--md">
            {names[cartVariants.indexOf(variant)]}
          </h2>
          <Cart variant={variant} demo />
        </section>
      ))}
    </main>
  );
}
