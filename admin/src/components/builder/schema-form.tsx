"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useId, useEffect, useRef } from "react";
import type { CmsForm } from "@/lib/builder/types";
import { safeUrl } from "@/lib/builder/catalog";
import { validateFormValues } from "@/lib/builder/form-values";
export function SchemaForm({
  definition: form,
  pageId,
  sectionId,
  serviceId,
}: {
  definition: CmsForm;
  pageId?: string;
  sectionId?: string;
  serviceId?: string;
}) {
  const tokenRef = useRef<{ pageId: string; promise: Promise<string> } | null>(
    null,
  );
  const loadToken = () => {
    if (!pageId) return Promise.reject(Error("Preview only."));
    if (tokenRef.current?.pageId === pageId) return tokenRef.current.promise;
    const promise = (async () => {
      const response = await fetch(
        `/api/forms/token?pageId=${encodeURIComponent(pageId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      await new Promise((resolve) => setTimeout(resolve, 1050));
      return result.token as string;
    })();
    tokenRef.current = { pageId, promise };
    promise.catch(() => {
      tokenRef.current = null;
    });
    return promise;
  };
  useEffect(() => {
    if (pageId) {
      const promise = (async () => {
        const response = await fetch(
          `/api/forms/token?pageId=${encodeURIComponent(pageId)}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        await new Promise((resolve) => setTimeout(resolve, 1050));
        return result.token as string;
      })();
      tokenRef.current = { pageId, promise };
      promise.catch(() => {
        tokenRef.current = null;
      });
    }
  }, [pageId]);
  const prefix = useId();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className={`cms-form cms-form--${form.layout}`}>
      {form.layout === "split" && safeUrl(form.image, true) && (
        <figure className="cms-form__media"><img
          className="cms-form__image"
          src={safeUrl(form.image, true)}
          alt=""
        /></figure>
      )}
      <form
        data-schema-form="true"
        className="cms-form__body"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const element = event.currentTarget;
          element.classList.add("cms-form--attempted");
          if (!element.checkValidity()) {
            element.querySelector<HTMLElement>(":invalid")?.focus();
            setNotice("");
            return;
          }
          if (!pageId || !sectionId) {
            setNotice("Preview only. Messages are not sent from the editor.");
            return;
          }
          setBusy(true);
          setNotice("Sending…");
          try {
            const data = new FormData(element);
            const input = Object.fromEntries(
              [...data.entries()].filter(([key]) => key !== "website"),
            ) as Record<string, string>;
            const values = validateFormValues(form, input);
            const token = await loadToken();
            const response = await fetch("/api/forms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pageId,
                sectionId,
                formId: form.id,
                serviceId,
                token,
                website: data.get("website") || "",
                values,
              }),
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error);
            setNotice(result.message);
            element.reset();
            element.classList.remove("cms-form--attempted");
          } catch (e) {
            setNotice(
              e instanceof Error
                ? e.message
                : "Could not send. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="cms-form__intro">
          <h2 className="heading heading--md">{form.title}</h2>
          {form.description && (
            <p className="text text--md text--muted">{form.description}</p>
          )}
        </div>
        <div
          className="cms-form__fields"
          style={
            {
              "--form-columns": form.columns || 2,
            } as import("react").CSSProperties
          }
        >
          {form.fields.map((field) => {
            const id = `${prefix}-${field.id}`;
            const common = {
              id,
              name: field.name,
              required: field.required,
              placeholder: field.placeholder,
            };
            return (
              <div
                key={field.id}
                className={`cms-form__field cms-form__field--${field.width}`}
              >
                {field.type === "checkbox" ? (
                  <label className="cms-form__check" htmlFor={id}>
                    <input {...common} type="checkbox" value="yes" />
                    <span>
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                  </label>
                ) : (
                  <>
                    <label htmlFor={id}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    {field.type === "textarea" ? (
                      <textarea {...common} rows={4} maxLength={5000} />
                    ) : field.type === "select" ? (
                      <select {...common} defaultValue="">
                        <option value="" disabled>
                          {field.placeholder || "Select an option"}
                        </option>
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...common}
                        type={field.type}
                        maxLength={500}
                        autoComplete={
                          field.type === "email"
                            ? "email"
                            : field.type === "tel"
                              ? "tel"
                              : "off"
                        }
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <input
          className="cms-form__trap"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <button className="button button--dark" type="submit" disabled={busy}>
          {busy ? "Sending…" : form.buttonLabel}
        </button>
        <p className="text text--sm" role="status" aria-live="polite">
          {notice}
        </p>
      </form>
    </div>
  );
}
