export const PAYMENT_METHODS = [
  "on_receipt",
  "invoice",
  "stripe",
  "yookassa",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentLabels: Record<PaymentMethod, string> = {
  on_receipt: "Pay on receipt",
  invoice: "Bank transfer / invoice",
  stripe: "Pay online · Stripe",
  yookassa: "Pay online · YooKassa",
};
export interface OrderPayment {
  method: PaymentMethod;
  status: "unpaid" | "pending" | "paid" | "cancelled";
  providerId?: string;
  url?: string;
  attempt?: string;
  createdAt?: string;
  paidAt?: string;
  needsReview?: boolean;
  test?: boolean;
  instructions?: string;
}
