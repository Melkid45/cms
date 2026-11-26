"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/admin/site-context";
import { catalogFetch } from "@/components/admin/catalog/use-catalog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { paymentSettingsView } from "@/lib/builder/payment-settings";
type Settings = ReturnType<typeof paymentSettingsView>;
export function PaymentSettings() {
  const workspace = useWorkspace();
  const [value, setValue] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    catalogFetch<Settings>("/api/builder/payments")
      .then((s) => {
        if (live) setValue(s);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!value)
    return <p role="status">{message || "Loading payment settings…"}</p>;
  const s = value;
  const change = (v: Partial<Settings>) => {
    setValue({ ...s, ...v });
    setMessage("");
  };
  const webhook = s.baseUrl
    ? `${s.baseUrl.replace(/\/$/, "")}/api/shop/payments/${s.provider}?site=${workspace?.site?.id || "default"}`
    : "";
  return (
    <section className="border-t pt-6">
      <h2 className="mb-5 font-semibold">Payments</h2>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const {
              stripeConfigured,
              webhookConfigured,
              yooConfigured,
              ...body
            } = s;
            void stripeConfigured;
            void webhookConfigured;
            void yooConfigured;
            setValue(
              await catalogFetch<Settings>("/api/builder/payments", {
                method: "PUT",
                body: JSON.stringify(body),
              }),
            );
            setMessage("Payment settings saved.");
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Could not save payments.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <label className="flex items-center justify-between gap-4 text-sm">
              Pay on receipt
              <Switch
                checked={s.onReceipt}
                onCheckedChange={(v) => change({ onReceipt: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              Bank transfer / invoice
              <Switch
                checked={s.invoice}
                onCheckedChange={(v) => change({ invoice: v })}
              />
            </label>
            {s.invoice && (
              <div className="space-y-2">
                <Label htmlFor="invoice-instructions">
                  Bank details & instructions
                </Label>
                <Textarea
                  id="invoice-instructions"
                  value={s.invoiceInstructions}
                  maxLength={2000}
                  onChange={(e) =>
                    change({ invoiceInstructions: e.target.value })
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="payment-provider">Online payments</Label>
              <Select
                id="payment-provider"
                value={s.provider}
                onValueChange={(v) =>
                  change({ provider: v as Settings["provider"] })
                }
              >
                <SelectOption value="none">Disabled</SelectOption>
                <SelectOption value="stripe">
                  Stripe · EUR / USD / GBP
                </SelectOption>
                <SelectOption value="yookassa">YooKassa · RUB</SelectOption>
              </Select>
            </div>
          </div>
          {s.provider !== "none" && (
            <div className="space-y-4 rounded-xl bg-neutral-50 p-5">
              <div className="space-y-2">
                <Label htmlFor="payment-origin">Store return address</Label>
                <Input
                  id="payment-origin"
                  type="url"
                  placeholder="https://example.com"
                  value={s.baseUrl}
                  onChange={(e) => change({ baseUrl: e.target.value })}
                />
                <p className="text-xs text-neutral-500">
                  Address of this store, used to return after payment. For local
                  testing use http://127.0.0.1:3000. Localhost cannot receive
                  provider notifications; use Check payment status on the order
                  page.
                </p>
                {process.env.NODE_ENV === "development" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => change({ baseUrl: window.location.origin })}
                  >
                    Use local address
                  </Button>
                )}
              </div>
              {s.provider === "stripe" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="stripe-key">Stripe secret key</Label>
                    <Input
                      id="stripe-key"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        s.stripeConfigured
                          ? "Saved · leave blank to keep"
                          : "sk_test_…"
                      }
                      value={s.stripeKey}
                      onChange={(e) => change({ stripeKey: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stripe-webhook">
                      Webhook signing secret
                    </Label>
                    <Input
                      id="stripe-webhook"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        s.webhookConfigured
                          ? "Saved · leave blank to keep"
                          : "whsec_…"
                      }
                      value={s.stripeWebhook}
                      onChange={(e) =>
                        change({ stripeWebhook: e.target.value })
                      }
                    />
                  </div>
                  <p className="text-xs text-neutral-500">
                    Events: checkout.session.completed,
                    checkout.session.async_payment_succeeded,
                    checkout.session.expired.
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="yoo-shop">Shop ID</Label>
                    <Input
                      id="yoo-shop"
                      value={s.shopId}
                      onChange={(e) => change({ shopId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yoo-key">Secret key</Label>
                    <Input
                      id="yoo-key"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        s.yooConfigured
                          ? "Saved · leave blank to keep"
                          : "test_…"
                      }
                      value={s.yooKey}
                      onChange={(e) => change({ yooKey: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-4 text-sm">
                    Send receipt data to YooKassa
                    <Switch
                      checked={s.receipt}
                      onCheckedChange={(v) => change({ receipt: v })}
                    />
                  </label>
                  {s.receipt ? (
                    <>
                      <Label htmlFor="vat-code">Receipt VAT code</Label>
                      <Select
                        id="vat-code"
                        value={String(s.vatCode)}
                        onValueChange={(v) => change({ vatCode: Number(v) })}
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectOption key={i + 1} value={String(i + 1)}>
                            {i + 1 === 1 ? "1 · No VAT" : `VAT code ${i + 1}`}
                          </SelectOption>
                        ))}
                      </Select>
                      <Label htmlFor="tax-system">Tax system</Label>
                      <Select
                        id="tax-system"
                        value={s.taxSystem ? String(s.taxSystem) : "account"}
                        onValueChange={(v) =>
                          change({
                            taxSystem: v === "account" ? null : Number(v),
                          })
                        }
                      >
                        <SelectOption value="account">
                          From YooKassa account
                        </SelectOption>
                        {[1, 2, 3, 4, 5, 6].map((v) => (
                          <SelectOption key={v} value={String(v)}>
                            Tax system {v}
                          </SelectOption>
                        ))}
                      </Select>
                      <p className="text-xs text-neutral-500">
                        VAT applies to all items. This integration supports
                        ordinary unmarked goods. Configure fiscal receipts in
                        your YooKassa account.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      Receipts must be handled by your separate fiscal
                      integration.
                    </p>
                  )}
                  <p className="text-xs text-neutral-500">
                    Events: payment.succeeded, payment.canceled.
                  </p>
                </>
              )}
              {webhook && (
                <div className="space-y-2">
                  <Label htmlFor="payment-webhook-url">Notification URL</Label>
                  <Input id="payment-webhook-url" readOnly value={webhook} />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save payment settings"}
          </Button>
          <p role="status" className="text-sm">
            {message}
          </p>
        </div>
      </form>
    </section>
  );
}
