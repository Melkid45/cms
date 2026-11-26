// Imported only by the isolated integration-test process. Never loaded by the app.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const original = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!/^https:\/\/api\.(stripe\.com|yookassa\.ru)\//.test(url))
    return original(input, init);
  const file = join(
    process.env.CMS_DATA_DIRECTORY,
    "payment-provider-test.json",
  );
  let state;
  try {
    state = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw Error("Payment mock not configured");
  }
  state.requests ||= [];
  state.requests.push({
    url,
    method: init.method || "GET",
    headers: init.headers,
    body: init.body,
  });
  const stripe = url.includes("stripe.com");
  let payload;
  if (init.method === "POST") {
    const body = stripe
      ? Object.fromEntries(new URLSearchParams(init.body))
      : JSON.parse(init.body);
    const metadata = stripe
      ? {
          site: body["metadata[site]"],
          order: body["metadata[order]"],
          attempt: body["metadata[attempt]"],
        }
      : body.metadata;
    const id = stripe
      ? "cs_test_mock123"
      : "12345678-1234-1234-1234-123456789012";
    state.remote = {
      id,
      metadata,
      ...(stripe
        ? {
            url: "https://checkout.stripe.com/c/pay/test_mock",
            amount_total: Number(
              body["line_items[0][price_data][unit_amount]"],
            ),
            currency: body["line_items[0][price_data][currency]"],
            payment_status: "unpaid",
            status: "open",
            livemode: false,
          }
        : {
            confirmation: {
              confirmation_url: "https://yoomoney.ru/checkout/test",
            },
            amount: body.amount,
            paid: false,
            status: "pending",
            test: true,
          }),
    };
    payload = state.remote;
  } else payload = { ...state.remote, ...state.override };
  writeFileSync(file, JSON.stringify(state));
  return Response.json(payload, { status: state.fail ? 503 : 200 });
};
