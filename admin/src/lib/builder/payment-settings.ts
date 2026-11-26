import "server-only";
import { z } from "zod";
import { readCommerceSettings } from "./commerce-store";
import { withDoc } from "./doc-store";
import { seal, unseal } from "./social/accounts";
import { StoreError } from "./server";
import type { PaymentMethod } from "./payments-shared";
interface Settings {
  revision: number;
  onReceipt: boolean;
  invoice: boolean;
  invoiceInstructions: string;
  provider: "none" | "stripe" | "yookassa";
  baseUrl: string;
  stripeKey: string;
  stripeWebhook: string;
  shopId: string;
  yooKey: string;
  receipt: boolean;
  vatCode: number;
  taxSystem: number | null;
}
const defaults = (): Settings => ({
  revision: 0,
  onReceipt: true,
  invoice: false,
  invoiceInstructions: "",
  provider: "none",
  baseUrl: "",
  stripeKey: "",
  stripeWebhook: "",
  shopId: "",
  yooKey: "",
  receipt: false,
  vatCode: 1,
  taxSystem: null,
});
const doc = (site: string) => `payments:${site}`;
export const paymentSettings = (site: string) =>
  withDoc(doc(site), defaults, (s) => s, false);
export const paymentSettingsView = (s: Settings) => ({
  ...s,
  stripeKey: "",
  stripeWebhook: "",
  yooKey: "",
  stripeConfigured: !!s.stripeKey,
  webhookConfigured: !!s.stripeWebhook,
  yooConfigured: !!s.yooKey,
});
export const paymentSettingsInput = z
  .object({
    revision: z.number().int().min(0),
    onReceipt: z.boolean(),
    invoice: z.boolean(),
    invoiceInstructions: z.string().trim().max(2000),
    provider: z.enum(["none", "stripe", "yookassa"]),
    baseUrl: z.union([
      z.literal(""),
      z.url().refine((v) => {
        const u = new URL(v);
        return (
          (u.protocol === "https:" ||
            (process.env.NODE_ENV === "development" &&
              u.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          u.pathname === "/"
        );
      }, "Use the HTTPS origin of this shop. Local development also supports http://127.0.0.1:3000."),
    ]),
    stripeKey: z.string().max(500),
    stripeWebhook: z.string().max(500),
    shopId: z.string().max(50),
    yooKey: z.string().max(500),
    receipt: z.boolean(),
    vatCode: z.number().int().min(1).max(12),
    taxSystem: z.number().int().min(1).max(6).nullable(),
  })
  .strict();
export async function savePaymentSettings(
  site: string,
  input: z.infer<typeof paymentSettingsInput>,
) {
  const commerce = await readCommerceSettings(site);
  if (input.provider === "yookassa" && commerce.currency !== "RUB")
    throw new StoreError(
      "Set the store currency to RUB before enabling YooKassa.",
    );
  if (input.provider === "stripe" && commerce.currency === "RUB")
    throw new StoreError("Select EUR, USD or GBP before enabling Stripe.");
  return withDoc(doc(site), defaults, (s) => {
    if (input.revision !== s.revision)
      throw new StoreError(
        "Payment settings changed elsewhere. Reload first.",
        409,
      );
    if (!input.onReceipt && !input.invoice && input.provider === "none")
      throw new StoreError("Enable at least one payment method.");
    if (input.invoice && !input.invoiceInstructions)
      throw new StoreError("Add bank transfer instructions.");
    if (input.provider !== "none" && !input.baseUrl)
      throw new StoreError("Add the public HTTPS website origin.");
    if (input.stripeKey && !/^sk_(test|live)_/.test(input.stripeKey))
      throw new StoreError("Enter a Stripe secret key.");
    if (input.stripeWebhook && !input.stripeWebhook.startsWith("whsec_"))
      throw new StoreError("Enter the Stripe webhook signing secret.");
    if (
      input.provider === "stripe" &&
      (!(input.stripeKey || s.stripeKey) ||
        !(input.stripeWebhook || s.stripeWebhook))
    )
      throw new StoreError("Add the Stripe key and webhook secret.");
    if (
      input.provider === "yookassa" &&
      (!/^\d+$/.test(input.shopId) || !(input.yooKey || s.yooKey))
    )
      throw new StoreError("Add the YooKassa shop ID and secret key.");
    // Shop ID changes invalidate the previous encrypted credential.
    if (input.shopId !== s.shopId && s.yooKey && !input.yooKey)
      throw new StoreError("Enter a new key when changing the shop ID.");
    const next = {
      ...input,
      stripeKey: input.stripeKey ? seal(input.stripeKey) : s.stripeKey,
      stripeWebhook: input.stripeWebhook
        ? seal(input.stripeWebhook)
        : s.stripeWebhook,
      yooKey: input.yooKey ? seal(input.yooKey) : s.yooKey,
      revision: s.revision + 1,
    };
    Object.assign(s, next);
    return paymentSettingsView(s);
  });
}
export function enabledPayments(
  s: Settings,
  currency: string,
): PaymentMethod[] {
  return [
    ...(s.onReceipt ? ["on_receipt" as const] : []),
    ...(s.invoice ? ["invoice" as const] : []),
    ...(s.provider === "stripe" &&
    currency !== "RUB" &&
    s.stripeKey &&
    s.stripeWebhook
      ? ["stripe" as const]
      : []),
    ...(s.provider === "yookassa" && currency === "RUB" && s.yooKey
      ? ["yookassa" as const]
      : []),
  ];
}
export const paymentSecret = (
  s: Settings,
  key: "stripeKey" | "stripeWebhook" | "yooKey",
) => unseal(s[key]);
