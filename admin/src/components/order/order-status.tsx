"use client";
// Private order status page: the token comes from the link (#t=…) or this browser.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BriefCard,
  type ClientOrder,
  loadKey,
  money,
  orderApi,
  OrderFrame,
  type Prices,
  saveKey,
  statusSteps,
} from "./order-shared";

function tokenFor(id: string) {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("t");
  if (hash) return hash;
  const stored = loadKey();
  return stored?.id === id ? stored.token : null;
}

const card =
  "rounded-2xl bg-white p-5 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]";

export function OrderStatus({ id }: { id: string }) {
  const [order, setOrder] = useState<ClientOrder | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [error, setError] = useState("");
  // Onboarding autopilot of this order (exists once the brief is confirmed).
  const [onboarding, setOnboarding] = useState<{ id: string; token: string } | null>(null);

  useEffect(() => {
    let live = true;
    const token = tokenFor(id);
    if (!token) {
      queueMicrotask(() =>
        setError(
          "Open this page with the private link you received after your order.",
        ),
      );
      return;
    }
    orderApi<ClientOrder>(`/api/orders/${id}`, { token }).then(
      (value) => {
        if (!live) return;
        setOrder(value);
        // Remember the order so /order continues it on this device.
        if (["interview", "submitted"].includes(value.status))
          saveKey({ id, token });
      },
      (failure: unknown) =>
        live &&
        setError(
          failure instanceof Error ? failure.message : "Order not found.",
        ),
    );
    orderApi<{ id: string }>(`/api/onboarding/by-order/${id}`, { token }).then(
      (value) => live && setOnboarding({ id: value.id, token }),
      () => undefined,
    );
    orderApi<Prices>("/api/orders/prices").then(
      (value) => live && setPrices(value),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (error)
    return (
      <OrderFrame>
        <div className={`mt-10 ${card}`}>
          <h1 className="text-xl font-semibold">
            We could not open this order
          </h1>
          <p className="mt-1 text-neutral-600">{error}</p>
          <Button
            size="lg"
            className="mt-4 h-10 px-4"
            nativeButton={false}
            render={<Link href="/order" />}
          >
            Order a website <ArrowRight />
          </Button>
        </div>
      </OrderFrame>
    );
  if (!order)
    return (
      <OrderFrame>
        <p className="flex items-center gap-2 py-16 text-neutral-500">
          <Loader2 className="size-4 animate-spin" /> Loading your order…
        </p>
      </OrderFrame>
    );

  const cancelled = order.status === "cancelled";
  const reached = statusSteps.findIndex((step) => step.status === order.status);
  const unfinished = ["interview", "submitted"].includes(order.status);
  const due = order.dueAt ? new Date(order.dueAt) : null;

  return (
    <OrderFrame>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pt-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">
            Order #{order.number}
          </h1>
          <p className="mt-1 text-neutral-600">
            {order.answers.business || "Your website"} · started{" "}
            {new Date(order.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {unfinished && (
          <div
            className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
          >
            <p>
              {order.status === "interview"
                ? "Your interview is not finished yet."
                : "Your brief is ready and waiting for your confirmation."}
            </p>
            <Button
              size="lg"
              className="h-10 shrink-0 px-4"
              nativeButton={false}
              render={<Link href="/order" />}
            >
              Continue your order <ArrowRight />
            </Button>
          </div>
        )}

        {onboarding && (
          <div
            className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
          >
            <p>
              Next: a short consultation about your business. We build the first
              version of your website from it.
            </p>
            <Button
              size="lg"
              className="h-10 shrink-0 px-4"
              nativeButton={false}
              render={
                <Link
                  href={`/onboarding/${onboarding.id}#t=${encodeURIComponent(onboarding.token)}`}
                />
              }
            >
              Open the consultation <ArrowRight />
            </Button>
          </div>
        )}

        <section className={card}>
          <h2 className="mb-4 text-lg font-semibold">Status</h2>
          {cancelled ? (
            <p className="text-neutral-600">
              This order was cancelled. Contact us if you have questions.
            </p>
          ) : (
            <ol className="grid gap-4">
              {statusSteps.map((step, index) => {
                const done = index < reached;
                const now = index === reached;
                return (
                  <li key={step.status} className="flex gap-3">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                        done
                          ? "bg-[#1d1d1b] text-white"
                          : now
                            ? "bg-[#1d1d1b] text-white ring-4 ring-[#1d1d1b]/10"
                            : "bg-[#f0efeb] text-neutral-500"
                      }`}
                    >
                      {done ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span
                        className={`block font-medium ${index > reached ? "text-neutral-500" : ""}`}
                      >
                        {step.label}
                        {now && (
                          <span className="font-normal text-neutral-500">
                            {" "}
                            — current step
                          </span>
                        )}
                      </span>
                      {now && (
                        <span className="block text-sm text-neutral-600">
                          {step.text}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {order.pack && (
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold">Package</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-neutral-500">Package</dt>
                <dd className="font-medium">
                  {order.pack === "designer" ? "Designer pack" : "Standard"}
                  {prices &&
                    ` · ${money(prices[order.pack].fee, prices.currency)}`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">Hosting</dt>
                <dd className="font-medium">
                  {order.plan === "monthly" ? "Monthly" : "Yearly"}
                  {prices &&
                    order.plan &&
                    ` · ${money(prices[order.plan], prices.currency)} / ${order.plan === "monthly" ? "month" : "year"}`}
                </dd>
              </div>
              {due && (
                <div>
                  <dt className="text-sm text-neutral-500">First version by</dt>
                  <dd className="font-medium">
                    {due.toLocaleString("en-GB", {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-neutral-500">Payment</dt>
                <dd className="font-medium">Arranged by our team</dd>
              </div>
            </dl>
          </section>
        )}

        {order.brief ? (
          <BriefCard order={order} />
        ) : (
          <section className={card}>
            <h2 className="text-lg font-semibold">Website brief</h2>
            <p className="mt-1 text-neutral-600">
              The brief appears here when you finish the interview.
            </p>
          </section>
        )}
      </div>
    </OrderFrame>
  );
}
