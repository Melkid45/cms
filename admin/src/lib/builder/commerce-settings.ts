// Shared operational shop settings. Design and block layouts stay in their own settings.
export interface CommerceSettings {
  revision: number;
  currency: "EUR" | "USD" | "GBP" | "RUB";
  delivery: {
    mode: "legacy" | "flat";
    pickup: boolean;
    shipping: boolean;
    fee: number;
    freeFrom: number | null;
    pickupAddress: string;
    country: "LV" | "other";
  };
  checkout: {
    phoneRequired: boolean;
    emailRequired: boolean;
    companies: boolean;
    newsletter: boolean;
    statusMessages: boolean;
  };
  notifications: { recipient: string; buyerConfirmation: boolean };
}
export const defaultCommerceSettings = (): CommerceSettings => ({
  revision: 0,
  currency: "EUR",
  delivery: {
    mode: "legacy",
    pickup: true,
    shipping: true,
    fee: 0,
    freeFrom: null,
    pickupAddress: "",
    country: "LV",
  },
  checkout: {
    phoneRequired: true,
    emailRequired: false,
    companies: true,
    newsletter: false,
    statusMessages: true,
  },
  notifications: { recipient: "", buyerConfirmation: true },
});
export const currencySymbol = (currency: CommerceSettings["currency"]) =>
  ({ EUR: "€", USD: "$", GBP: "£", RUB:"₽" })[currency];
