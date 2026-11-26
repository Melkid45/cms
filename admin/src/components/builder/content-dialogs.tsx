"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CmsForm, CmsService } from "@/lib/builder/types";
import { safeUrl } from "@/lib/builder/safe-url";
import { SchemaForm } from "./schema-form";
// Dialogs of button actions (forms, services in modal/drawer mode) for the website canvas.
// Gets only the published forms and services (not the whole project), so public pages ship
// no more data than they show.
export function ContentDialogs({
  forms,
  services,
  pageId,
  siteId,
  locale,
}: {
  forms: CmsForm[];
  services: CmsService[];
  pageId?: string;
  siteId?: string;
  locale?: string;
}) {
  const project = useMemo(
    () => ({ formDefinitions: forms, services }),
    [forms, services],
  );
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState<{
    type: "form" | "service";
    id: string;
    sectionId: string;
    serviceId?: string;
  } | null>(null);
  const service =
    active?.type === "service"
      ? project.services?.find((s) => s.id === active.id)
      : undefined;
  const form =
    active?.type === "form"
      ? project.formDefinitions?.find((f) => f.id === active.id)
      : undefined;
  const close = () => {
    ref.current?.classList.remove("is-visible");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      ref.current?.close();
      setActive(null);
      opener.current?.focus();
    }, 220);
  };
  useEffect(() => {
    const root = ref.current?.closest(".site-canvas");
    if (!root) return;
    const click = (e: Event) => {
      const event = e as MouseEvent;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        root.hasAttribute("data-select-sections")
      )
        return;
      const button = (event.target as Element).closest<HTMLElement>(
        "[data-content-form],[data-content-service]",
      );
      if (!button) return;
      const type = button.dataset.contentForm ? "form" : "service";
      const id =
        button.dataset.contentForm || button.dataset.contentService || "";
      const target =
        type === "form"
          ? project.formDefinitions?.find((f) => f.id === id)
          : project.services?.find((s) => s.id === id);
      if (!target) return;
      if (
        type === "service" &&
        ["page", "editorial"].includes((target as CmsService).mode)
      )
        return;
      event.preventDefault();
      opener.current = button;
      clearTimeout(timer.current);
      setActive({ type, id, sectionId: button.dataset.actionSection || "" });
    };
    root.addEventListener("click", click);
    return () => {
      root.removeEventListener("click", click);
      clearTimeout(timer.current);
    };
  }, [project]);
  useEffect(() => {
    if (!active) return;
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      dialog.classList.add("is-visible"),
    );
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
    };
  }, [active]);
  return (
    <dialog
      ref={ref}
      className={`content-dialog ${service?.mode === "drawer" ? "content-dialog--drawer" : ""}`}
      aria-label={service?.title || form?.title || "Details"}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="content-dialog__surface">
        <button
          className="content-dialog__close"
          onClick={close}
          aria-label="Close"
        >
          <X />
        </button>
        {service && (
          <div className="service-content">
            {service.image && (
              <img src={safeUrl(service.image, true)} alt={service.imageAlt} />
            )}
            <h2 className="heading heading--lg">{service.title}</h2>
            <p className="text text--lg">{service.summary}</p>
            <div className="text text--md service-content__body">
              {service.body}
            </div>
            {service.formId &&
              project.formDefinitions?.some((f) => f.id === service.formId) && (
                <button
                  className="button button--dark"
                  onClick={() =>
                    setActive({
                      type: "form",
                      id: service.formId,
                      sectionId: active!.sectionId,
                      serviceId: service.id,
                    })
                  }
                >
                  Discuss this service
                </button>
              )}
          </div>
        )}
        {form && (
          <SchemaForm
            key={form.id}
            definition={form}
            pageId={pageId}
            sectionId={active?.sectionId}
            serviceId={active?.serviceId}
            siteId={siteId}
            locale={locale}
          />
        )}
      </div>
    </dialog>
  );
}
