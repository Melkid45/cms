"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import Splide from "@splidejs/splide";
import "@splidejs/splide/css/core";
import { SectionRenderer } from "./section-renderer";
import type { Project, Section } from "@/lib/builder/types";
export function SiteCanvas({
  project,
  sections,
  layout = true,
  pageId,
}: {
  project: Project;
  sections: Section[];
  layout?: boolean;
  pageId?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lightbox = useRef<HTMLDialogElement>(null);
  const [photo, setPhoto] = useState<{
    url: string;
    alt: string;
    title: string;
    text: string;
  } | null>(null);
  useEffect(() => {
    if (photo && !lightbox.current?.open) lightbox.current?.showModal();
  }, [photo]);
  useEffect(() => {
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
      "[data-services-slider],[data-testimonials-slider],[data-projects-slider],[data-process-slider]",
    ).forEach((element) => {
      element.tabIndex = 0;
      if (!element.getAttribute("aria-label"))
        element.setAttribute(
          "aria-label",
          `${element.closest("section")?.querySelector("h2,h1")?.textContent || "Content"} carousel`,
        );
      const variant = element.dataset.testimonialsSlider;
      const perPage =
        element.hasAttribute("data-process-slider") || variant === "single"
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
        element.closest("[data-testimonials-controls],.process") ||
        element.parentElement;
      parent
        ?.querySelectorAll<HTMLElement>(
          "[data-testimonials-prev],[data-process-prev]",
        )
        .forEach((button) =>
          button.addEventListener("click", () => slider.go("<"), { signal }),
        );
      parent
        ?.querySelectorAll<HTMLElement>(
          "[data-testimonials-next],[data-process-next]",
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
    el.querySelectorAll<HTMLElement>(".faq,[data-services-accordion]").forEach(
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
    let token = "";
    const loadToken = async () => {
      if (!pageId) return "";
      const response = await fetch(
        `/api/forms/token?pageId=${encodeURIComponent(pageId)}`,
        { signal },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      token = result.token;
      return token;
    };
    if (pageId) loadToken().catch(() => {});
    el.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
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
            notice.textContent =
              "Preview only. Messages are not sent from the editor.";
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
          notice.textContent = "Sending…";
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
                pageId,
                sectionId: form.dataset.cmsForm,
                token: token || (await loadToken()),
                website: trap.value,
                values,
              }),
              signal,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            notice.textContent = result.message;
            form.reset();
          } catch (error) {
            if (!signal.aborted)
              notice.textContent =
                error instanceof Error
                  ? error.message
                  : "Could not send your message. Please try again.";
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
      el.querySelectorAll("input[name=website]").forEach((input) =>
        input.remove(),
      );
      el.querySelectorAll(".faq__motion").forEach((m) => {
        m.replaceWith(...m.childNodes);
      });
      document.documentElement.removeAttribute("data-site-menu-open");
    };
  }, [project, sections, layout, pageId]);
  const b = project.brand;
  const style = {
    "--color-ink": b.primary,
    "--color-bg": b.secondary,
    "--color-accent": b.alternative,
    "--color-surface": `color-mix(in srgb, ${b.secondary} 93%, ${b.primary})`,
    "--color-muted": `color-mix(in srgb, ${b.primary} 65%, ${b.secondary})`,
    "--color-border": `color-mix(in srgb, ${b.primary} 18%, ${b.secondary})`,
    "--color-interactive": b.primary,
    "--color-button-hover": `color-mix(in srgb, ${b.primary} 85%, white)`,
  } as CSSProperties;
  return (
    <div
      ref={root}
      className="site-canvas"
      style={style}
      onClick={(event) => {
        const button = (event.target as Element).closest<HTMLElement>(
          "[data-gallery-photo],[data-project]",
        );
        if (!button) return;
        const card = button.closest("article") || button;
        const image = card.querySelector<HTMLImageElement>("img");
        if (!image) return;
        event.preventDefault();
        setPhoto({
          url: image.currentSrc || image.src,
          alt: image.alt,
          title: card.querySelector("h3,h2")?.textContent || image.alt,
          text: card.querySelector("p")?.textContent || "",
        });
      }}
    >
      {layout && (
        <div className="builder-header-slot">
          <SectionRenderer section={project.layout.header} project={project} />
        </div>
      )}
      <main className="builder-sections section-stack">
        {sections
          .filter((section) => !section.hidden)
          .map((section, i) => (
            <SectionRenderer
              key={`${section.id}-${section.variant}`}
              section={section}
              project={project}
              first={i === 0}
            />
          ))}
      </main>
      {layout && (
        <SectionRenderer section={project.layout.footer} project={project} />
      )}
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
    </div>
  );
}
