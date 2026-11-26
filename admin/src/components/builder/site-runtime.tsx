"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import Splide from "@splidejs/splide";
import "@splidejs/splide/css/core";
import { mountSiteWidgets } from "./site-widgets";
import { mountStoreControls } from "./store-controls";
import { mountShopWidgets } from "./shop-widgets";
import { mountMapWidgets } from "./map-widgets";
import { mountCartWidgets, type CartLook } from "./cart-widgets";
import { StoreCart } from "./store-cart";
import type { canvasRootProps } from "./site-canvas-markup";
import { mountAccountWidgets } from "./account-widgets";
import { mountBookingWidgets } from "./booking-widgets";
import { uiText } from "@/lib/builder/i18n";
// Client behaviours of a rendered website (menus, sliders, accordions, tabs, forms, widgets).
// Imports no templates and no project data: public pages render the markup on the server
// (site-canvas-markup.tsx) and ship only this runtime; the editor's SiteCanvas uses the same hook.
export type SiteRuntimeOptions = {
  siteId?: string;
  pageId?: string;
  // Page language, else the website's default language.
  locale?: string;
  lang?: string;
  formsOff?: boolean;
  checkout?: { id: string; href: string };
  // Cart window look (project.store): the header cart button opens it (store-cart.tsx).
  cartLook?: CartLook;
  // Instant checkout popup instead of a cart (project.store.checkout = "popup", checkout-popup.ts).
  checkoutPopup?: boolean;
};
export function useSiteRuntime(
  root: React.RefObject<HTMLDivElement | null>,
  { siteId, pageId, locale, lang, formsOff, checkout, cartLook, checkoutPopup }: SiteRuntimeOptions,
  // Changes when the editor re-renders the markup, so behaviours re-mount on the new DOM.
  version?: unknown,
) {
  const text = uiText(lang);
  const checkoutId = checkout?.id,
    checkoutHref = checkout?.href;
  // Primitive deps: the options object is new on every render.
  const cartVariant = cartLook?.variant,
    cartButton = cartLook?.button ? JSON.stringify(cartLook.button) : "";
  useEffect(() => {
    const checkout =
      checkoutId && checkoutHref ? { id: checkoutId, href: checkoutHref } : undefined;
    const el = root.current;
    if (!el) return;
    const controller = new AbortController(),
      signal = controller.signal;
    const sliders: Splide[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const transitions = new WeakMap<
      HTMLDetailsElement,
      ReturnType<typeof setTimeout>
    >();
    const header = el.querySelector<HTMLElement>("[data-site-header]"),
      slot = el.querySelector<HTMLElement>(".builder-header-slot");
    const size = () => {
      if (header && slot) {
        const h = header.getBoundingClientRect().height;
        slot.style.height = `${h}px`;
        el.style.setProperty("--header-height", `${h}px`);
      }
    };
    const observer = new ResizeObserver(size);
    if (header) observer.observe(header);
    size();
    const toggle =
        header?.querySelector<HTMLButtonElement>("[data-menu-toggle]"),
      panel = el.querySelector<HTMLElement>("[data-menu-panel]");
    if (toggle && panel) {
      const media = matchMedia("(max-width:1024px)");
      const compact = header!.classList.contains("site-header--compact");
      const close = () => {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
        document.documentElement.removeAttribute("data-site-menu-open");
      };
      const resize = () => {
        toggle.hidden = !(media.matches || compact);
        if (toggle.hidden) close();
      };
      resize();
      window.addEventListener("resize", resize, { signal });
      toggle.addEventListener(
        "click",
        () => {
          const open = panel.hidden;
          panel.hidden = !open;
          toggle.setAttribute("aria-expanded", String(open));
          toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
          document.documentElement.toggleAttribute("data-site-menu-open", open);
          panel.style.top = `${header!.getBoundingClientRect().height}px`;
          panel.style.height = `calc(100dvh - ${header!.getBoundingClientRect().height}px)`;
        },
        { signal },
      );
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape" && !panel.hidden) {
            close();
            toggle.focus();
          }
          if (e.key === "Tab" && !panel.hidden) {
            const links = [
              toggle,
              ...panel.querySelectorAll<HTMLElement>("a,button,summary"),
            ];
            const first = links[0],
              last = links.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        },
        { signal },
      );
      panel.addEventListener(
        "click",
        (e) => {
          if ((e.target as Element).closest("a")) close();
        },
        { signal },
      );
    }
    el.querySelectorAll<HTMLElement>(
      "[data-services-slider],[data-testimonials-slider],[data-projects-slider],[data-process-slider],[data-projects-spotlight]",
    ).forEach((element) => {
      element.tabIndex = 0;
      if (!element.getAttribute("aria-label"))
        element.setAttribute(
          "aria-label",
          `${element.closest("section")?.querySelector("h2,h1")?.textContent || "Content"} carousel`,
        );
      const variant = element.dataset.testimonialsSlider;
      // data-projects-spotlight: one project at a time (projects-v10, origin/main).
      const spotlight = element.hasAttribute("data-projects-spotlight");
      const perPage =
        spotlight || element.hasAttribute("data-process-slider") || variant === "single"
          ? 1
          : ["split", "stories"].includes(variant || "")
            ? 2
            : 3;
      const slider = new Splide(element, {
        type: "loop",
        perPage,
        perMove: 1,
        gap: 24,
        arrows: false,
        pagination: false,
        keyboard: "focused",
        breakpoints: {
          1024: { perPage: Math.min(perPage, 2) },
          640: { perPage: 1 },
        },
      }).mount();
      sliders.push(slider);
      const parent =
        (spotlight ? element.closest(".projects") : null) ||
        element.closest("[data-testimonials-controls],.process") ||
        element.parentElement;
      parent
        ?.querySelectorAll<HTMLElement>(
          "[data-testimonials-prev],[data-process-prev],[data-spotlight-prev]",
        )
        .forEach((button) =>
          button.addEventListener("click", () => slider.go("<"), { signal }),
        );
      parent
        ?.querySelectorAll<HTMLElement>(
          "[data-testimonials-next],[data-process-next],[data-spotlight-next]",
        )
        .forEach((button) =>
          button.addEventListener("click", () => slider.go(">"), { signal }),
        );
      parent
        ?.querySelectorAll<HTMLElement>(
          ".testimonials__navigation,.process__navigation",
        )
        .forEach((n) => {
          n.hidden = false;
        });
    });
    el.querySelectorAll<HTMLElement>(
      ".faq,[data-services-accordion],[data-services-folds]",
    ).forEach(
      (group) => {
        const items = [
          ...group.querySelectorAll<HTMLDetailsElement>("details"),
        ];
        if (!items.length) return;
        if (!items.some((i) => i.open)) items[0].open = true;
        items.forEach((item) => {
          const answer = item.querySelector<HTMLElement>(".faq__answer");
          let motion: HTMLElement | null = null;
          if (answer) {
            motion = document.createElement("div");
            motion.className = "faq__motion";
            answer.before(motion);
            motion.append(answer);
            motion.style.height = item.open ? "auto" : "0px";
            item.dataset.expanded = String(item.open);
          }
          item.querySelector("summary")?.addEventListener(
            "click",
            (e) => {
              e.preventDefault();
              if (group.hasAttribute("data-services-accordion")) {
                if (item.open) return;
                const y = window.scrollY;
                items.forEach((other) => (other.open = other === item));
                const image = group.querySelector<HTMLImageElement>(
                  ".services__visual img",
                );
                if (image && item.dataset.image) {
                  image.src = item.dataset.image;
                  image.alt = item.dataset.alt || "";
                }
                group.getBoundingClientRect();
                window.scrollTo({ top: y, behavior: "instant" });
                return;
              }
              const expanded = item.dataset.expanded === "true";
              if (
                expanded &&
                items.filter((i) => i.dataset.expanded === "true").length === 1
              )
                return;
              if (!motion) {
                item.open = !item.open;
                return;
              }
              const next = !expanded;
              const previous = transitions.get(item);
              if (previous) clearTimeout(previous);
              motion.style.height = `${motion.getBoundingClientRect().height}px`;
              item.open = true;
              void motion.offsetHeight;
              item.dataset.expanded = String(next);
              motion.inert = !next;
              motion.style.height = `${next ? motion.scrollHeight : 0}px`;
              const timer = setTimeout(() => {
                if (item.dataset.expanded === String(next)) {
                  item.open = next;
                  motion!.style.height = next ? "auto" : "0px";
                }
              }, 320);
              transitions.set(item, timer);
              timers.push(timer);
            },
            { signal },
          );
        });
      },
    );
    for (const family of ["advantages", "process"])
      el.querySelectorAll<HTMLElement>(`[data-${family}-tabs]`).forEach(
        (group) => {
          const tabs = [
            ...group.querySelectorAll<HTMLElement>(`[data-${family}-tab]`),
          ];
          const panels = [
            ...group.querySelectorAll<HTMLElement>(`[data-${family}-panel]`),
          ];
          if (tabs.length !== panels.length) return;
          const activate = (n: number) => {
            tabs.forEach((tab, i) => {
              tab.setAttribute("role", "tab");
              tab.setAttribute("aria-selected", String(i === n));
              tab.tabIndex = i === n ? 0 : -1;
              panels[i].classList.toggle("is-active", i === n);
              panels[i].inert = i !== n;
            });
          };
          tabs.forEach((tab, n) => {
            tab.addEventListener("click", () => activate(n), { signal });
            tab.addEventListener(
              "keydown",
              (e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? tabs.length - 1
                        : (n +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  activate(next);
                  tabs[next].focus();
                }
              },
              { signal },
            );
          });
          activate(0);
          group.classList.add("is-enhanced");
        },
      );
    // Hero showcase: slides change when the active progress bar finishes its
    // CSS animation, so pausing the animation (hover/focus) pauses the cycle.
    const showcases: (() => void)[] = [];
    el.querySelectorAll<HTMLElement>("[data-hero-showcase]").forEach(
      (stage) => {
        const slides = [...stage.querySelectorAll<HTMLElement>(".hero__slide")];
        const progress = stage.querySelector<HTMLElement>(
          "[data-hero-progress]",
        );
        if (!slides.length) return;
        let current = 0;
        const bars =
          slides.length > 1 && progress
            ? slides.map((slide, n) => {
                const bar = document.createElement("button");
                bar.type = "button";
                bar.className = "hero__bar";
                bar.setAttribute(
                  "aria-label",
                  `Show ${slide.querySelector(".hero__site-name")?.textContent?.trim() || "website"}`,
                );
                const track = document.createElement("span"),
                  fill = document.createElement("span");
                track.className = "hero__bar-track";
                fill.className = "hero__bar-fill";
                track.append(fill);
                bar.append(track);
                bar.addEventListener("click", () => activate(n), { signal });
                fill.addEventListener(
                  "animationend",
                  () => {
                    if (n === current) activate((current + 1) % slides.length);
                  },
                  { signal },
                );
                progress.append(bar);
                return bar;
              })
            : [];
        const activate = (n: number) => {
          current = n;
          slides.forEach((slide, i) => {
            slide.classList.toggle("is-active", i === n);
            slide.inert = i !== n;
          });
          bars.forEach((bar, i) => {
            bar.classList.toggle("is-active", i === n);
            bar.classList.toggle("is-done", i < n);
            if (i === n) bar.setAttribute("aria-current", "true");
            else bar.removeAttribute("aria-current");
          });
        };
        const pause = (on: boolean) => stage.toggleAttribute("data-paused", on);
        stage.addEventListener(
          "pointerenter",
          (e) => e.pointerType === "mouse" && pause(true),
          { signal },
        );
        stage.addEventListener(
          "pointerleave",
          () => !stage.contains(document.activeElement) && pause(false),
          { signal },
        );
        stage.addEventListener("focusin", () => pause(true), { signal });
        stage.addEventListener(
          "focusout",
          (e) =>
            !stage.contains(e.relatedTarget as Node | null) &&
            !stage.matches(":hover") &&
            pause(false),
          { signal },
        );
        activate(0);
        stage.classList.add("is-enhanced");
        showcases.push(() => {
          bars.forEach((bar) => bar.remove());
          slides.forEach((slide) => {
            slide.classList.remove("is-active");
            slide.inert = false;
          });
          stage.classList.remove("is-enhanced");
          stage.removeAttribute("data-paused");
        });
      },
    );
    const unmountShopWidgets = mountShopWidgets(el, signal);
    const unmountMapWidgets = mountMapWidgets(el, signal);
    const unmountAccount = mountAccountWidgets(el, signal, { siteId, locale: lang, editing: el.dataset.selectSections === "true" });
    // Online booking widget (contact-v60).
    const unmountBooking = mountBookingWidgets(el, signal, { siteId, pageId, locale: lang, editing: el.dataset.selectSections === "true" });
    // Shop cart: needs a published checkout page (pricing-v24), preferably in this language.
    const unmountCart = mountCartWidgets(el, signal, {
      siteId,
      pageId,
      locale,
      checkout,
      popup: !!checkoutPopup,
      look: cartVariant
        ? { variant: cartVariant, button: cartButton ? JSON.parse(cartButton) : undefined }
        : undefined,
    });
    const unmountWidgets = mountSiteWidgets(
      el,
      signal,
      el.dataset.selectSections === "true",
    );
    const unmountStoreControls = mountStoreControls(el);
    let token = "";
    const loadToken = async () => {
      if (!pageId) return "";
      const response = await fetch(
        `/api/forms/token?pageId=${encodeURIComponent(pageId)}${siteId ? `&site=${encodeURIComponent(siteId)}` : ""}`,
        { signal },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      token = result.token;
      return token;
    };
    // Token for enquiry forms: fetched only when the page has a form.
    if (pageId && el.querySelector("form")) loadToken().catch(() => {});
    // Forms of the form builder (SchemaForm, data-schema-form) send themselves.
    el.querySelectorAll<HTMLFormElement>("form:not([data-schema-form])").forEach((form) => {
      const trap = document.createElement("input");
      trap.name = "website";
      trap.tabIndex = -1;
      trap.autocomplete = "off";
      trap.setAttribute("aria-hidden", "true");
      trap.style.cssText =
        "position:absolute;left:-10000px;width:1px;height:1px";
      form.append(trap);
      form.addEventListener(
        "submit",
        async (e) => {
          e.preventDefault();
          if (!form.reportValidity()) return;
          let notice = form.querySelector<HTMLElement>('[role="status"]');
          if (!notice) {
            notice = document.createElement("p");
            notice.className = "form-notice text text--sm";
            notice.setAttribute("role", "status");
            form.append(notice);
          }
          if (!pageId) {
            notice.textContent = text.preview;
            return;
          }
          if (formsOff) {
            notice.textContent = text.unavailable;
            return;
          }
          const buttons = [
            ...form.querySelectorAll<HTMLButtonElement>(
              "button[type=submit],button:not([type])",
            ),
          ];
          if (form.dataset.sending === "true") return;
          form.dataset.sending = "true";
          buttons.forEach((b) => (b.disabled = true));
          notice.textContent = text.sending;
          try {
            const values = Object.fromEntries(
              [...new FormData(form).entries()].filter(
                ([name, value]) =>
                  name !== "website" && typeof value === "string",
              ),
            );
            const response = await fetch("/api/forms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...(siteId ? { site: siteId } : {}),
                pageId,
                sectionId: form.dataset.cmsForm,
                token: token || (await loadToken()),
                website: trap.value,
                ...(locale ? { locale } : {}),
                values,
              }),
              signal,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            notice.textContent = result.message;
            form.reset();
            // Blocks with their own success view (calculator-v40) listen for this.
            form.dispatchEvent(new CustomEvent("cms:sent"));
          } catch (error) {
            if (!signal.aborted)
              notice.textContent =
                error instanceof Error
                  ? error.message
                  : text.failed;
          } finally {
            form.dataset.sending = "false";
            buttons.forEach((b) => (b.disabled = false));
          }
        },
        { signal },
      );
    });
    return () => {
      controller.abort();
      observer.disconnect();
      sliders.forEach((slider) => slider.destroy(true));
      timers.forEach(clearTimeout);
      showcases.forEach((reset) => reset());
      unmountStoreControls();
      unmountWidgets();
      unmountShopWidgets();
      unmountMapWidgets();
      unmountAccount();
      unmountBooking();
      unmountCart();
      el.querySelectorAll("input[name=website]").forEach((input) =>
        input.remove(),
      );
      el.querySelectorAll(".faq__motion").forEach((m) => {
        m.replaceWith(...m.childNodes);
      });
      document.documentElement.removeAttribute("data-site-menu-open");
    };
  }, [root, version, pageId, siteId, text, locale, lang, formsOff, checkoutId, checkoutHref, cartVariant, cartButton, checkoutPopup]);
}
type Photo = { url: string; alt: string; title: string; text: string };
// Image lightbox for gallery photos and project cards ([data-gallery-photo], [data-project]).
export function useLightbox() {
  const lightbox = useRef<HTMLDialogElement>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  useEffect(() => {
    if (photo && !lightbox.current?.open) lightbox.current?.showModal();
  }, [photo]);
  const onClick = (event: React.MouseEvent) => {
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-gallery-photo],[data-project]",
    );
    if (!button) return;
    const card = button.closest("article") || button;
    const image = card.querySelector<HTMLImageElement>("img");
    if (!image) return;
    event.preventDefault();
    setPhoto({
      // src = the full-size image (currentSrc may be a small responsive copy).
      url: image.src || image.currentSrc,
      alt: image.alt,
      title: card.querySelector("h3,h2")?.textContent || image.alt,
      text: card.querySelector("p")?.textContent || "",
    });
  };
  const dialog = (
    <dialog
      ref={lightbox}
      className="builder-lightbox"
      aria-label={photo?.title || "Image preview"}
      onClose={() => setPhoto(null)}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <button
        type="button"
        className="builder-lightbox__close"
        aria-label="Close image preview"
        onClick={() => lightbox.current?.close()}
      >
        <X size={24} />
      </button>
      {photo && (
        <>
          <img src={photo.url} alt={photo.alt} />
          <h2 className="heading heading--sm">{photo.title}</h2>
          {photo.text && (
            <p className="text text--md text--muted">{photo.text}</p>
          )}
        </>
      )}
    </dialog>
  );
  return { onClick, dialog };
}
// Public pages: the server-rendered website markup (children) inside its .site-canvas root.
export function SiteRuntime({
  options,
  rootProps,
  children,
}: {
  options: SiteRuntimeOptions;
  rootProps: ReturnType<typeof canvasRootProps>;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useSiteRuntime(root, options);
  const { onClick, dialog } = useLightbox();
  return (
    <div ref={root} {...rootProps} onClick={onClick}>
      {children}
      {dialog}
      <RuntimeCart options={options} />
    </div>
  );
}
// The cart window, when the website has a cart look and a checkout page.
export function RuntimeCart({ options }: { options: SiteRuntimeOptions }) {
  if (!options.cartLook || !options.checkout || !options.siteId || options.checkoutPopup) return null;
  return (
    <StoreCart
      variant={options.cartLook.variant}
      siteId={options.siteId}
      locale={options.lang}
      checkoutHref={options.checkout.href}
    />
  );
}
