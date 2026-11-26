import {
  paymentLabels,
  type PaymentMethod,
} from "@/lib/builder/payments-shared";
export function paymentChoice(
  anchor: HTMLElement,
  methods: PaymentMethod[],
  className: string,
) {
  const label = document.createElement("label");
  label.className = "shop-payment-choice";
  label.textContent = "Payment method";
  const select = document.createElement("select");
  select.className = className;
  select.setAttribute("aria-label", "Payment method");
  select.required = true;
  for (const method of methods) {
    if (!paymentLabels[method]) continue;
    const option = document.createElement("option");
    option.value = method;
    option.textContent = paymentLabels[method];
    select.append(option);
  }
  label.append(select);
  anchor.before(label);
  return { element: label, select, value: () => select.value as PaymentMethod };
}
