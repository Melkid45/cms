"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { PageHeader } from "./page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartSymbol } from "@/components/builder/cart";
import { MediaPicker } from "@/components/builder/media-picker";
import { saveProject, useProject } from "@/lib/builder/client";
import {
  cartIcons,
  cartVariants,
  type CartButton,
  type CartVariant,
} from "@/lib/builder/types";

const layouts: Record<CartVariant, { name: string; position: string }> = {
  drawer: { name: "Side drawer", position: "inset-y-0 right-0 w-[43%]" },
  modal: { name: "Centred dialog", position: "inset-[22%]" },
  sheet: { name: "Bottom sheet", position: "inset-x-[12%] bottom-0 h-[53%]" },
  wide: { name: "Wide dialog", position: "inset-x-[9%] inset-y-[24%]" },
  full: { name: "Full screen", position: "inset-0" },
};

export function ShopSettings() {
  const { project } = useProject();
  const [draft, setDraft] = useState<{
    cart: CartVariant;
    button: CartButton;
  }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const store = project?.store;
  if (!project) return <p>Loading shop settings…</p>;
  if (!store?.enabled)
    return (
      <Link href="/dashboard/settings/project">Open Project settings</Link>
    );
  const settings = draft ?? {
    cart: store.cart,
    button: store.button ?? { icon: "bag" as const },
  };

  async function save() {
    if (!project?.store?.enabled || !draft) return;
    setBusy(true);
    setNotice("");
    try {
      await saveProject({ ...project, store: { ...project.store, ...draft } });
      setDraft(undefined);
      setNotice("Shop settings saved.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save shop settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shop"
        description="Manage your storefront."
        action={
          <Button type="button" disabled={busy || !draft} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      />
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <CardTitle>Header button</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div
                className="flex flex-wrap gap-2"
                aria-label="Built-in icons"
                role="group"
              >
                {cartIcons.map((icon) => (
                  <Button
                    key={icon}
                    type="button"
                    variant={
                      settings.button.icon === icon && !settings.button.image
                        ? "default"
                        : "outline"
                    }
                    aria-pressed={
                      settings.button.icon === icon && !settings.button.image
                    }
                    onClick={() =>
                      setDraft({
                        ...settings,
                        button: { ...settings.button, icon, image: "" },
                      })
                    }
                  >
                    <CartSymbol button={{ icon }} />
                    <span className="capitalize">{icon}</span>
                  </Button>
                ))}
              </div>
              <MediaPicker
                label="Choose custom icon"
                value={settings.button.image || ""}
                onChange={(image) =>
                  setDraft({
                    ...settings,
                    button: { ...settings.button, image },
                  })
                }
              />
              <label className="grid gap-2 text-sm">
                Button label
                <Input
                  placeholder="Icon only"
                  maxLength={24}
                  value={settings.button.label || ""}
                  onChange={(event) =>
                    setDraft({
                      ...settings,
                      button: { ...settings.button, label: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="self-start rounded-xl border bg-neutral-50 p-4">
              <p className="mb-3 text-xs text-neutral-500">
                Header button preview
              </p>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-2">
                <span className="truncate text-sm font-semibold">
                  {project.brand.name}
                </span>
                <span className="cart-trigger shrink-0 text-sm">
                  <CartSymbol button={settings.button} />
                  {settings.button.label}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <CardTitle>Cart layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {cartVariants.map((cart) => {
                const selected = settings.cart === cart;
                return (
                  <button
                    key={cart}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...settings, cart })}
                    className={`overflow-hidden rounded-xl border text-left transition hover:border-neutral-700 ${selected ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"}`}
                  >
                    <span
                      aria-hidden="true"
                      className="relative block aspect-[16/10] overflow-hidden bg-neutral-200"
                    >
                      <span className="absolute inset-x-4 top-4 h-2 rounded bg-neutral-300" />
                      <span
                        className={`absolute flex flex-col gap-2 rounded bg-white p-3 shadow-sm ${layouts[cart].position}`}
                      >
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
            <Link
              className="text-sm underline"
              href={`/cart-preview?layout=${settings.cart}`}
              target="_blank"
              rel="noreferrer"
            >
              Try selected layout
            </Link>
          </CardContent>
        </Card>
      </fieldset>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Customer account</CardTitle>
        </CardHeader>
        <CardContent className="p-5 text-sm text-neutral-500">
          Customer accounts are not connected yet.
        </CardContent>
      </Card>
    </div>
  );
}
