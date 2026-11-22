"use client";
import { useEffect } from "react";

// First-party analytics beacon of published pages (BUILDER.md → Analytics). Rendered only by
// the public page route, never in the editor, previews or library. No cookies, no storage,
// no third parties: one beacon per view, one with the visible time when the page is hidden,
// one per contact action (phone, email, WhatsApp, Telegram, calculator), and (v2) funnel
// steps, clicks on links/buttons (element + its text only, never what is typed), scroll depth
// marks and a "still here" ping (15 s, 30 s, then every minute while visible) for "Live now".
// Visible time is reported in parts: each ping carries the time since the last report and the
// leave beacon the rest, so time on page survives a lost final beacon. f = 1 marks the first
// report of a view (the server counts it once).
let firstView = true;
// React development mode mounts effects twice: one view per page load and address.
let lastView = { key: "", at: 0 };
function send(body: Record<string, unknown>) {
  try {
    const data = JSON.stringify(body);
    if (
      !navigator.sendBeacon?.(
        "/api/builder/track",
        new Blob([data], { type: "text/plain" }),
      )
    )
      void fetch("/api/builder/track", {
        method: "POST",
        body: data,
        keepalive: true,
        headers: { "Content-Type": "text/plain" },
      }).catch(() => {});
  } catch {}
}
function contactKind(link: HTMLAnchorElement) {
  const href = link.getAttribute("href") || "";
  if (/^tel:/i.test(href)) return "phone";
  if (/^mailto:/i.test(href)) return "email";
  if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com)|^whatsapp:/i.test(href))
    return "whatsapp";
  if (/^(https?:\/\/)?(t\.me|telegram\.me)\/|^tg:/i.test(href)) return "telegram";
  // A link to a pop-up section that contains the price calculator.
  if (href.startsWith("#") && href.length > 1) {
    const id = href.slice(1);
    const modal = [...document.querySelectorAll<HTMLElement>("[data-modal]")].find(
      (m) => m.dataset.modal === id,
    );
    if (modal?.querySelector("form[data-calc]")) return "calculator";
  }
  return null;
}
const steps = ["product", "cart", "checkout", "order", "form_start", "form_sent", "booking"];
const PRODUCT = ".pricing__shop-card, [data-product], [data-configurator]";
const CLICKABLE =
  'a[href], button, [role="button"], summary, input[type="submit"], input[type="button"]';
// Forms that are not enquiries: checkout, search, buyer account.
const notLead = (form: Element) =>
  !!form.closest('.pricing--checkout, [data-modal="search"], [data-modal="account"]') ||
  !!form.querySelector('input[type="search"], input[type="password"]');
// "section id|path from the section|text" of a clicked link or button. Only the element's own
// text (website content) is used; clicks into input fields are never recorded.
function clickKey(target: Element | null) {
  const el = target?.closest?.(CLICKABLE);
  if (!el || el.closest("input:not([type=submit]):not([type=button]), textarea, select")) return null;
  const section = el.closest<HTMLElement>("[data-section-id]");
  const root = section || document.body;
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== root && parts.length < 12; node = node.parentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`);
  }
  const path = parts.join(">").slice(0, 200);
  const raw =
    el instanceof HTMLInputElement
      ? el.value
      : el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "";
  const label = raw.replace(/[|<>\s]+/g, " ").trim().slice(0, 60);
  const id = (section?.dataset.sectionId || "").replace(/[^\w-]/g, "").slice(0, 60);
  return `${id}|${path}|${label}`;
}
export function SiteAnalytics({ siteId, pageId }: { siteId: string; pageId: string }) {
  useEffect(() => {
    if (window.top !== window || navigator.webdriver) return;
    let visibleSince = 0;
    let visible = 0;
    let started = false;
    const base = { s: siteId, p: pageId };
    const sentSteps = new Set<string>();
    const step = (name: string) => {
      if (!started || !steps.includes(name) || sentSteps.has(name)) return;
      sentSteps.add(name);
      send({ ...base, t: "event", e: name });
    };
    let clicks = 0;
    let scrollSent = 0;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let pings = 0;
    let reported = false;
    let stepTimer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (started) return;
      started = true;
      if (document.visibilityState === "visible") visibleSince = Date.now();
      // Funnel: product or catalogue page, checkout page (after the widgets have mounted).
      stepTimer = setTimeout(() => {
        if (document.querySelector(PRODUCT)) step("product");
        if (document.querySelector(".pricing--checkout")) step("checkout");
        measureScroll();
      }, 800);
      const key = pageId + location.href;
      if (lastView.key === key && Date.now() - lastView.at < 2000) return;
      lastView = { key, at: Date.now() };
      const query = new URLSearchParams(location.search);
      // Page changes inside the website keep the first referrer: mark them as internal.
      const referrer = firstView ? document.referrer : location.href;
      firstView = false;
      send({
        ...base,
        t: "view",
        ...(referrer ? { r: referrer.slice(0, 500) } : {}),
        ...Object.fromEntries(
          (
            [
              ["us", "utm_source"],
              ["um", "utm_medium"],
              ["uc", "utm_campaign"],
            ] as const
          )
            .map(([key, name]) => [key, (query.get(name) || "").slice(0, 100)])
            .filter(([, value]) => value),
        ),
      });
    };
    // Sends the visible time collected since the last report (leave or ping).
    const report = (kind: "leave" | "ping", min: number) => {
      if (!started || visible < min) return false;
      send({ ...base, t: kind, ms: Math.min(Math.round(visible), 3_600_000), f: reported ? 0 : 1 });
      reported = true;
      visible = 0;
      return true;
    };
    const flushTime = () => {
      if (visibleSince) visible += Date.now() - visibleSince;
      visibleSince = 0;
      report("leave", 500);
      visible = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushTime();
      else if (started) visibleSince = Date.now();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.("a[href]");
      if (link instanceof HTMLAnchorElement) {
        const kind = contactKind(link);
        if (kind) send({ ...base, t: "action", a: kind });
      }
      if (!started || clicks >= 40) return;
      const key = clickKey(target);
      if (key) {
        clicks++;
        send({ ...base, t: "click", k: key });
      }
    };
    // Scroll depth: the deepest of 25/50/75/100 % reached, sent once per mark.
    function measureScroll() {
      const height = document.documentElement.scrollHeight;
      if (!height) return;
      const depth = Math.min(100, ((window.scrollY + window.innerHeight) / height) * 100);
      const mark = [100, 75, 50, 25].find((m) => depth >= m - 1) || 0;
      if (started && mark > scrollSent) {
        scrollSent = mark;
        send({ ...base, t: "scroll", d: mark });
      }
    }
    const onScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(measureScroll, 700);
    };
    // Funnel events of other widgets: window.dispatchEvent(new CustomEvent("cms:track", { detail: { e: "cart" } })).
    const onTrack = (event: Event) => {
      const name = (event as CustomEvent<{ e?: string }>).detail?.e;
      if (name) step(name);
    };
    const onFocus = (event: FocusEvent) => {
      const field = event.target as Element | null;
      if (!field?.matches?.("input, textarea, select")) return;
      const form = field.closest("form[data-cms-form]");
      if (form && !notLead(form)) step("form_start");
    };
    // site-canvas dispatches the non-bubbling "cms:sent" on the form: listen in the capture phase.
    const onSent = (event: Event) => {
      const form = event.target as Element | null;
      if (form?.matches?.("form") && !notLead(form)) {
        sentSteps.delete("form_sent");
        step("form_sent");
      }
    };
    let pingTimer: ReturnType<typeof setTimeout> | undefined;
    const ping = () => {
      if (started && document.visibilityState === "visible" && pings++ < 30) {
        if (visibleSince) visible += Date.now() - visibleSince;
        visibleSince = Date.now();
        if (!report("ping", 1000)) send({ ...base, t: "ping" });
      }
      pingTimer = setTimeout(ping, pings < 2 ? 15_000 : 60_000);
    };
    pingTimer = setTimeout(ping, 15_000);
    // A page prerendered by the browser is counted only when the visitor actually opens it.
    const doc = document as Document & { prerendering?: boolean };
    if (doc.prerendering)
      document.addEventListener("prerenderingchange", start, { once: true });
    else start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushTime);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("cms:track", onTrack);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("cms:sent", onSent, true);
    return () => {
      flushTime();
      clearTimeout(scrollTimer);
      clearTimeout(stepTimer);
      clearTimeout(pingTimer);
      document.removeEventListener("prerenderingchange", start);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushTime);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("cms:track", onTrack);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("cms:sent", onSent, true);
    };
  }, [siteId, pageId]);
  return null;
}
