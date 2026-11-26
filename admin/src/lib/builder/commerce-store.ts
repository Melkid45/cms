import "server-only";
import { z } from "zod";
import { withDoc } from "./doc-store";
import { StoreError } from "./server";
import {
  defaultCommerceSettings,
  type CommerceSettings,
} from "./commerce-settings";
export const commerceInput = z
  .object({
    revision: z.number().int().nonnegative(),
    currency: z.enum(["EUR", "USD", "GBP", "RUB"]),
    delivery: z
      .object({
        mode: z.enum(["legacy", "flat"]),
        pickup: z.boolean(),
        shipping: z.boolean(),
        fee: z.number().min(0).max(1000000),
        freeFrom: z.number().min(0).max(10000000).nullable(),
        pickupAddress: z.string().trim().max(500),
        country: z.enum(["LV", "other"]),
      })
      .strict()
      .refine((v) => v.pickup || v.shipping, "Enable pickup or delivery."),
    checkout: z
      .object({
        phoneRequired: z.boolean(),
        emailRequired: z.boolean(),
        companies: z.boolean(),
        newsletter: z.boolean(),
        statusMessages: z.boolean(),
      })
      .strict()
      .refine(
        (v) => v.phoneRequired || v.emailRequired,
        "Require a phone number or email.",
      ),
    notifications: z
      .object({
        recipient: z.union([z.literal(""), z.email().max(254)]),
        buyerConfirmation: z.boolean(),
      })
      .strict(),
  })
  .strict();
const id = (site: string) => `shop-settings:${site}`;
export const readCommerceSettings = (site: string) =>
  withDoc(id(site), defaultCommerceSettings, (s) => s, false);
export const saveCommerceSettings = (site: string, value: CommerceSettings) =>
  withDoc(id(site), defaultCommerceSettings, (current) => {
    if (value.revision !== current.revision)
      throw new StoreError(
        "Shop settings changed elsewhere. Reload before saving.",
        409,
      );
    Object.assign(current, value, { revision: current.revision + 1 });
    return current;
  });
