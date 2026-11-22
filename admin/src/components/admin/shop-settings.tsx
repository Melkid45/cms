"use client";
// Shop cart look (merged from origin/main Shop settings): the header cart button (icon,
// picture, label) and the layout of the cart window (store-cart.tsx). The cart itself, orders
// and the catalogue stay ours (cart-widgets.ts, Sales → Shop orders / Catalog). Without a
// layout the header button goes straight to the checkout page, as before.
import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartSymbol } from "@/components/builder/store-cart";
import { MediaPicker } from "@/components/builder/media-picker";
import { useProject } from "@/lib/builder/client";
import { subPanel } from "./admin-panel";
import {
  cartIcons,
  cartVariants,
  type CartButton,
  type CartVariant,
  type Project,
} from "@/lib/builder/types";

const layouts: Record<CartVariant, { name: string; position: string }> = {
  drawer: { name: "Side drawer", position: "inset-y-0 right-0 w-[43%]" },
  modal: { name: "Centred dialog", position: "inset-[22%]" },
  sheet: { name: "Bottom sheet", position: "inset-x-[12%] bottom-0 h-[53%]" },
  wide: { name: "Wide dialog", position: "inset-x-[9%] inset-y-[24%]" },
  full: { name: "Full screen", position: "inset-0" },
};
type Draft = { cart?: CartVariant; button: CartButton };

export function ShopSettings() {
  const { project, error: loadError, save } = useProject();
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (!project)
    return <p className="text-sm text-neutral-500">{loadError || "Loading…"}</p>;
  const store = project.store;
  const settings: Draft = draft ?? {
    cart: store?.cart,
    button: store?.button ?? { icon: "cart" },
  };
  const hasCheckout = project.pages.some(
    (p) => !p.deletedAt && p.sections.some((s) => s.variant === "pricing-v24"),
  );

  async function submit() {
    if (!project || !draft) return;
    setBusy(true);
    setNotice("");
    try {
      // Other store fields (legacy origin/main ones included) are kept as they are.
      const { cart, button } = draft;
      const next: Project = { ...project };
      if (cart) next.store = { ...project.store, cart, button };
      else if (project.store) {
        // Back to the plain checkout link: only the cart look is removed.
        const rest = { ...project.store } as Partial<NonNullable<Project["store"]>>;
        delete rest.cart;
        delete rest.button;
        next.store = Object.keys(rest).length
          ? (rest as NonNullable<Project["store"]>)
          : undefined;
      }
      await save(next);
      setDraft(undefined);
      setNotice("Cart settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the cart settings.");
    } finally {
      setBusy(false);
    }
  }
  const set = (patch: Partial<Draft>) => setDraft({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-neutral-600">
          How the shopping cart opens on the website. Products and orders are
          managed in Sales → Catalog and Shop orders.
          {!hasCheckout && (
            <> The cart appears once the website has a checkout page.</>
          )}
        </p>
        <Button type="button" disabled={busy || !draft} onClick={submit}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <section className={`${subPanel} space-y-4 p-5`}>
          <h2 className="text-sm font-semibold">Cart window</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <button
              type="button"
              aria-pressed={!settings.cart}
              onClick={() => set({ cart: undefined })}
              className={`overflow-hidden rounded-xl bg-white text-left transition-shadow hover:shadow-md ${!settings.cart ? "shadow-[0_0_0_2px_rgb(0_0_0/0.8)]" : ""}`}
            >
              <span aria-hidden="true" className="relative block aspect-[16/10] bg-neutral-100">
                <span className="absolute inset-x-4 top-4 h-2 rounded bg-neutral-300" />
                <span className="absolute inset-x-4 bottom-4 top-10 rounded bg-white" />
              </span>
              <span className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-medium">
                Checkout page
                {!settings.cart && <Check className="size-4 shrink-0" />}
              </span>
            </button>
            {cartVariants.map((cart) => {
              const selected = settings.cart === cart;
              return (
                <button
                  key={cart}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set({ cart })}
                  className={`overflow-hidden rounded-xl bg-white text-left transition-shadow hover:shadow-md ${selected ? "shadow-[0_0_0_2px_rgb(0_0_0/0.8)]" : ""}`}
                >
                  <span aria-hidden="true" className="relative block aspect-[16/10] overflow-hidden bg-neutral-200">
                    <span className="absolute inset-x-4 top-4 h-2 rounded bg-neutral-300" />
                    <span className={`absolute flex flex-col gap-2 rounded bg-white p-3 shadow-sm ${layouts[cart].position}`}>
                      <span className="h-1.5 w-1/2 shrink-0 rounded bg-neutral-800" />
                      <span className="h-3 shrink-0 rounded bg-neutral-100" />
                      <span className="h-3 shrink-0 rounded bg-neutral-100" />
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-medium">
                    {layouts[cart].name}
                    {selected && <Check className="size-4 shrink-0" />}
                  </span>
                </button>
              );
            })}
          </div>
          {settings.cart && (
            <a
              className="inline-flex items-center gap-1.5 text-sm underline"
              href={`/cart-preview?layout=${settings.cart}`}
              target="_blank"
              rel="noreferrer"
            >
              Try this layout <ExternalLink className="size-3.5" />
            </a>
          )}
        </section>
        <section className={`${subPanel} grid gap-5 p-5 lg:grid-cols-2`}>
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">Header button</h2>
            <div className="flex flex-wrap gap-2" aria-label="Built-in icons" role="group">
              {cartIcons.map((icon) => {
                const active = settings.button.icon === icon && !settings.button.image;
                return (
                  <Button
                    key={icon}
                    type="button"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    onClick={() => set({ button: { ...settings.button, icon, image: "" } })}
                  >
                    <CartSymbol button={{ icon }} />
                    <span className="capitalize">{icon}</span>
                  </Button>
                );
              })}
            </div>
            <MediaPicker
              value={settings.button.image || ""}
              onChange={(image) => set({ button: { ...settings.button, image } })}
            />
            <label className="grid gap-2 text-sm">
              Button label
              <Input
                placeholder="Icon only"
                maxLength={24}
                value={settings.button.label || ""}
                onChange={(event) =>
                  set({ button: { ...settings.button, label: event.target.value } })
                }
              />
            </label>
          </div>
          <div className="self-start rounded-xl bg-white p-4">
            <p className="mb-3 text-xs text-neutral-500">Header button preview</p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-4 py-2">
              <span className="truncate text-sm font-semibold">{project.brand.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm">
                <CartSymbol button={settings.button} />
                {settings.button.label}
              </span>
            </div>
          </div>
        </section>
      </fieldset>
    </div>
  );
}
