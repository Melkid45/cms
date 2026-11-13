"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "./page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectOption } from "@/components/ui/select";
import { saveProject, useProject } from "@/lib/builder/client";
import { cartVariants, type CartVariant } from "@/lib/builder/types";

const layoutNames: Record<CartVariant, string> = {
  drawer: "Side drawer",
  modal: "Centred dialog",
  sheet: "Bottom sheet",
  wide: "Wide dialog",
  full: "Full screen",
};

export function ShopSettings() {
  const { project } = useProject();
  const [draft, setDraft] = useState<CartVariant>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (!project) return <p>Loading shop settings…</p>;
  const store = project.store;
  if (!store?.enabled)
    return (
      <>
        <PageHeader
          title="Shop"
          description="Enable Online store in Project settings to manage your shop."
        />
        <Link className="text-sm underline" href="/dashboard/settings/project">
          Open Project settings
        </Link>
      </>
    );
  const cart = draft ?? store.cart;
  async function save() {
    if (!project?.store?.enabled) return;
    setBusy(true);
    setNotice("");
    try {
      await saveProject({ ...project, store: { ...project.store, cart } });
      setDraft(undefined);
      setNotice("Cart layout saved.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save cart layout.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Shop"
        description="Manage the storefront experience."
      />
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="max-w-sm">
            <Select
              aria-label="Cart layout"
              value={cart}
              disabled={busy}
              onValueChange={(value) => {
                const variant = cartVariants.find((option) => option === value);
                if (variant) setDraft(variant);
              }}
            >
              {cartVariants.map((variant) => (
                <SelectOption key={variant} value={variant}>
                  {layoutNames[variant]}
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              disabled={busy || cart === store.cart}
              onClick={save}
            >
              Save cart layout
            </Button>
            <Link
              className="text-sm underline"
              href="/cart-preview"
              target="_blank"
              rel="noreferrer"
            >
              Preview cart layouts
            </Link>
          </div>
          <p role="status" className="text-sm">
            {notice}
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Customer account</CardTitle>
        </CardHeader>
        <CardContent className="p-5 text-sm text-neutral-500">
          Sign-in, customer profiles and order history will be configured here
          once customer accounts are connected.
        </CardContent>
      </Card>
    </div>
  );
}
