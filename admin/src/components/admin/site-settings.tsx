"use client";

import { useState } from "react";
import { Globe, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { saveProject, useProject } from "@/lib/builder/client";
import { cartVariants, type CartVariant } from "@/lib/builder/types";
import { Switch } from "@/components/ui/switch";

function SettingToggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-1 text-xs leading-5 text-neutral-400">{description}</p>
      </div>
      <Switch id={id} name={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SiteSettings() {
  const { project } = useProject();
  const [draft, setDraft] = useState<{ enabled: boolean; cart: CartVariant }>();
  const settings = draft ??
    project?.store ?? { enabled: false, cart: "drawer" as const };
  const { enabled: store, cart } = settings;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function saveStore() {
    if (!project) return;
    setBusy(true);
    setNotice("");
    try {
      await saveProject({ ...project, store: settings });
      setDraft(undefined);
      setNotice("Cart settings saved.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save cart settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  const [indexing, setIndexing] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [guest, setGuest] = useState(true);
  const [delivery, setDelivery] = useState(true);

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Globe className="size-4" /> Website
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="siteLanguage">Default language</Label>
              <Select id="siteLanguage" name="siteLanguage" defaultValue="en">
                <SelectOption value="en">English</SelectOption>
                <SelectOption value="ru">Russian</SelectOption>
                <SelectOption value="de">German</SelectOption>
              </Select>
              <p className="text-xs text-neutral-400">
                Used for new pages and default website content.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="siteTimezone">Time zone</Label>
              <Select id="siteTimezone" name="siteTimezone" defaultValue="UTC">
                <SelectOption value="UTC">UTC</SelectOption>
                <SelectOption value="Europe/London">
                  Europe / London
                </SelectOption>
                <SelectOption value="Europe/Berlin">
                  Europe / Berlin
                </SelectOption>
                <SelectOption value="Europe/Moscow">
                  Europe / Moscow
                </SelectOption>
                <SelectOption value="Asia/Omsk">Asia / Omsk</SelectOption>
                <SelectOption value="America/New_York">
                  America / New York
                </SelectOption>
              </Select>
              <p className="text-xs text-neutral-400">
                Used for scheduled publishing and order timestamps.
              </p>
            </div>
          </div>
          <div className="space-y-5 border-t pt-5">
            <SettingToggle
              id="siteIndexing"
              label="Search engine visibility"
              description="Allow public pages to be indexed. Individual pages can still use noindex."
              checked={indexing}
              onChange={setIndexing}
            />
            <SettingToggle
              id="siteMaintenance"
              label="Maintenance mode"
              description="Show a maintenance page to visitors while the admin panel remains available."
              checked={maintenance}
              onChange={setMaintenance}
            />
            {maintenance && (
              <div className="grid gap-2 rounded-lg border bg-neutral-50 p-4">
                <Label htmlFor="maintenanceMessage">Visitor message</Label>
                <Input
                  id="maintenanceMessage"
                  name="maintenanceMessage"
                  defaultValue="We're making a few improvements. Please check back soon."
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingBag className="size-4" /> Online store
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <SettingToggle
            id="siteOnlineStore"
            label="This website is an online store"
            description="Show the cart icon in the website header."
            checked={store}
            onChange={(enabled) => setDraft({ ...settings, enabled })}
          />
          {store && (
            <div className="space-y-5 border-t pt-5">
              <div className="grid gap-2">
                <Label htmlFor="cartLayout">Cart layout</Label>
                <Select
                  id="cartLayout"
                  value={cart}
                  onValueChange={(value) =>
                    setDraft({ ...settings, cart: value as CartVariant })
                  }
                >
                  {cartVariants.map((variant, index) => (
                    <SelectOption key={variant} value={variant}>
                      {
                        [
                          "Side drawer",
                          "Centred dialog",
                          "Bottom sheet",
                          "Wide dialog",
                          "Full screen",
                        ][index]
                      }
                    </SelectOption>
                  ))}
                </Select>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="storeCurrency">Store currency</Label>
                  <Select
                    id="storeCurrency"
                    name="storeCurrency"
                    defaultValue="RUB"
                  >
                    <SelectOption value="RUB">RUB — Russian ruble</SelectOption>
                    <SelectOption value="USD">USD — US dollar</SelectOption>
                    <SelectOption value="EUR">EUR — Euro</SelectOption>
                    <SelectOption value="GBP">GBP — British pound</SelectOption>
                  </Select>
                  <p className="text-xs text-neutral-400">
                    Default currency for product prices and orders.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="orderEmail">Order notification email</Label>
                  <Input
                    id="orderEmail"
                    name="orderEmail"
                    type="email"
                    placeholder="orders@example.com"
                  />
                  <p className="text-xs text-neutral-400">
                    Leave empty to use the project contact email.
                  </p>
                </div>
              </div>
              <SettingToggle
                id="storeGuestCheckout"
                label="Guest checkout"
                description="Let customers place orders without creating an account."
                checked={guest}
                onChange={setGuest}
              />
              <SettingToggle
                id="storeDelivery"
                label="Delivery required"
                description="Collect a shipping address at checkout. Turn off for digital products or services."
                checked={delivery}
                onChange={setDelivery}
              />
              <p className="rounded-lg border bg-neutral-50 p-3 text-xs leading-5 text-neutral-500">
                Payment methods, shipping rates and taxes will have their own
                settings when the store is connected.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              disabled={!project || !draft || busy}
              onClick={saveStore}
            >
              Save cart settings
            </Button>
            <a
              className="text-sm underline"
              href="/cart-preview"
              target="_blank"
              rel="noreferrer"
            >
              Preview cart layouts
            </a>
            <p role="status" className="text-sm">
              {notice}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
