"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { catalogFetch } from "@/components/admin/catalog/use-catalog";
import type { CommerceSettings } from "@/lib/builder/commerce-settings";
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-5 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
export function OperationalSettings({
  group = "delivery",
}: {
  group?: "delivery" | "checkout";
}) {
  const [saved, setSaved] = useState<CommerceSettings | null>(null),
    [draft, setDraft] = useState<CommerceSettings | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    catalogFetch<CommerceSettings>("/api/builder/shop-settings")
      .then((s) => {
        if (live) setSaved(s);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const s = draft || saved;
  if (!s)
    return (
      <p role="status" className="text-sm text-neutral-500">
        {message || "Loading store settings…"}
      </p>
    );
  const change = (next: CommerceSettings) => {
    setDraft(next);
    setMessage("");
  };
  return (
    <form
      className="space-y-7"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft) return;
        setBusy(true);
        setMessage("");
        try {
          const next = await catalogFetch<CommerceSettings>(
            "/api/builder/shop-settings",
            { method: "PUT", body: JSON.stringify(draft) },
          );
          setSaved(next);
          setDraft(null);
          setMessage("Shop settings saved.");
        } catch (e) {
          setMessage(
            e instanceof Error ? e.message : "Could not save shop settings.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">
        {group === "delivery"
          ? "Currency & delivery"
          : "Checkout & notifications"}
      </h2>
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <section hidden={group !== "delivery"} className="space-y-4">
          <div className="space-y-2">
            <Label>Store currency</Label>
            <Select
              aria-label="Store currency"
              value={s.currency}
              onValueChange={(currency) =>
                change({
                  ...s,
                  currency: currency as CommerceSettings["currency"],
                })
              }
            >
              {["EUR", "USD", "GBP", "RUB"].map((c) => (
                <SelectOption key={c} value={c}>
                  {c}
                </SelectOption>
              ))}
            </Select>
            <p className="text-xs text-neutral-500">
              Changing the currency keeps price amounts unchanged.
            </p>
          </div>
          <Toggle
            label="Allow pickup"
            checked={s.delivery.pickup}
            onChange={(pickup) =>
              change({ ...s, delivery: { ...s.delivery, pickup } })
            }
          />
          <Toggle
            label="Allow delivery"
            checked={s.delivery.shipping}
            onChange={(shipping) =>
              change({ ...s, delivery: { ...s.delivery, shipping } })
            }
          />
          {s.delivery.shipping && (
            <>
              <div className="space-y-2">
                <Label>Delivery pricing</Label>
                <Select
                  aria-label="Delivery pricing"
                  value={s.delivery.mode}
                  onValueChange={(mode) =>
                    change({
                      ...s,
                      delivery: {
                        ...s.delivery,
                        mode: mode as "legacy" | "flat",
                      },
                    })
                  }
                >
                  <SelectOption value="flat">Flat rate</SelectOption>
                  <SelectOption value="legacy">
                    Existing delivery zones
                  </SelectOption>
                </Select>
              </div>
              {s.delivery.mode === "flat" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="shop-fee">Delivery fee, {s.currency}</Label>
                    <Input
                      id="shop-fee"
                      type="number"
                      required
                      min={0}
                      max={1000000}
                      step="0.01"
                      value={s.delivery.fee}
                      onChange={(e) =>
                        change({
                          ...s,
                          delivery: {
                            ...s.delivery,
                            fee: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shop-free">Free delivery from</Label>
                    <Input
                      id="shop-free"
                      type="number"
                      min={0}
                      max={10000000}
                      step="0.01"
                      placeholder="No threshold"
                      value={s.delivery.freeFrom ?? ""}
                      onChange={(e) =>
                        change({
                          ...s,
                          delivery: {
                            ...s.delivery,
                            freeFrom:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}
          {s.delivery.pickup && (
            <div className="space-y-2">
              <Label htmlFor="shop-pickup">Pickup address</Label>
              <Textarea
                id="shop-pickup"
                rows={2}
                maxLength={500}
                value={s.delivery.pickupAddress}
                onChange={(e) =>
                  change({
                    ...s,
                    delivery: { ...s.delivery, pickupAddress: e.target.value },
                  })
                }
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Address & company lookup</Label>
            <Select
              aria-label="Address and company lookup"
              value={s.delivery.country}
              onValueChange={(country) =>
                change({
                  ...s,
                  delivery: {
                    ...s.delivery,
                    country: country as "LV" | "other",
                  },
                })
              }
            >
              <SelectOption value="other">
                General checkout · enter details manually
              </SelectOption>
              <SelectOption value="LV">
                Latvia · address and company register
              </SelectOption>
            </Select>
          </div>
        </section>
        <section hidden={group !== "checkout"} className="space-y-4">
          <Toggle
            label="Require phone number"
            checked={s.checkout.phoneRequired}
            onChange={(phoneRequired) =>
              change({ ...s, checkout: { ...s.checkout, phoneRequired } })
            }
          />
          <Toggle
            label="Require email address"
            checked={s.checkout.emailRequired}
            onChange={(emailRequired) =>
              change({ ...s, checkout: { ...s.checkout, emailRequired } })
            }
          />
          <Toggle
            label="Allow company purchases"
            checked={s.checkout.companies}
            onChange={(companies) =>
              change({ ...s, checkout: { ...s.checkout, companies } })
            }
          />
          <Toggle
            label="Offer newsletter signup"
            checked={s.checkout.newsletter}
            onChange={(newsletter) =>
              change({ ...s, checkout: { ...s.checkout, newsletter } })
            }
          />
          <Toggle
            label="Offer order status messages"
            checked={s.checkout.statusMessages}
            onChange={(statusMessages) =>
              change({ ...s, checkout: { ...s.checkout, statusMessages } })
            }
          />
          <h3 className="pt-3 text-sm font-semibold">Notifications</h3>
          <div className="space-y-2">
            <Label htmlFor="shop-recipient">New order recipient</Label>
            <Input
              id="shop-recipient"
              type="email"
              maxLength={254}
              value={s.notifications.recipient}
              placeholder="Website enquiry recipient"
              onChange={(e) =>
                change({
                  ...s,
                  notifications: {
                    ...s.notifications,
                    recipient: e.target.value,
                  },
                })
              }
            />
          </div>
          <Toggle
            label="Email confirmation to buyer"
            checked={s.notifications.buyerConfirmation}
            onChange={(buyerConfirmation) =>
              change({
                ...s,
                notifications: { ...s.notifications, buyerConfirmation },
              })
            }
          />
        </section>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy || !draft}>
          {busy ? "Saving…" : "Save store settings"}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
