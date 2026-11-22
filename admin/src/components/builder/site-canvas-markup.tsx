import type { CSSProperties, ReactNode } from "react";
import { SectionRenderer, mainHeadingIsEmpty } from "./section-renderer";
import type { Project, Section } from "@/lib/builder/types";
import { fontPairVars } from "@/lib/builder/font-pairs";
import { buttonAttrs, styleVars } from "@/lib/builder/style-presets";
import { localizedLayoutValues } from "@/lib/builder/i18n";
import { connectedContent } from "@/lib/builder/inline-content";
import { ContentDialogs } from "./content-dialogs";
// Website markup without client code: rendered on the server for public pages
// (SitePublicCanvas) and inside the editor's SiteCanvas. Behaviours: site-runtime.tsx.

// Black or white text, whichever reads better on a #rrggbb background.
function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#111111";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return l > 0.4 ? "#111111" : "#ffffff";
}
// Attributes of the .site-canvas root element.
export function canvasRootProps(project: Project, locale?: string) {
  const b = project.brand;
  const style = {
    "--brand-on-accent": readableOn(b.alternative),
    "--color-ink": b.primary,
    "--color-bg": b.secondary,
    "--color-accent": b.alternative,
    "--color-surface": `color-mix(in srgb, ${b.secondary} 93%, ${b.primary})`,
    "--color-muted": `color-mix(in srgb, ${b.primary} 65%, ${b.secondary})`,
    "--color-border": `color-mix(in srgb, ${b.primary} 18%, ${b.secondary})`,
    "--color-interactive": b.primary,
    "--color-button-hover": `color-mix(in srgb, ${b.primary} 85%, white)`,
    // Button looks (button-theme.scss, only with data-button-style): brand primary unless style.buttonColor.
    "--color-button": b.primary,
    "--color-button-text": readableOn(b.primary),
    ...fontPairVars(project.fonts),
    // Style preset values (radius, spacing, buttons, surface/muted); custom CSS still wins.
    ...styleVars(project.style, b.secondary),
  } as CSSProperties;
  return {
    // Font variables: next/font classes in the editor (SiteCanvas), public/fonts/site-fonts.*.css on public pages.
    className: "site-canvas",
    // Websites with a style preset opt in to the preset-only library rules (button shape, tone spacing).
    "data-site-style": project.style
      ? project.style.preset || "custom"
      : undefined,
    lang: locale || project.languages?.default || undefined,
    ...buttonAttrs(project.style),
    style,
  };
}
// Cart window look of the website (project.store), for the site runtime.
export function cartLookOf(project: Project) {
  return project.store?.cart && project.store.checkout !== "popup"
    ? { variant: project.store.cart, button: project.store.button }
    : undefined;
}
// Website setting "Instant checkout popup (no cart)": order buttons open checkout-popup.ts.
export const checkoutPopupOf = (project: Project) =>
  project.store?.checkout === "popup";
// Published checkout page (pricing-v24) for the shop cart, preferably in this language.
export function checkoutTarget(project: Project, locale?: string) {
  const pages = project.pages.filter(
    (p) =>
      p.status === "Published" &&
      !p.deletedAt &&
      p.sections.some((s) => s.variant === "pricing-v24" && !s.hidden),
  );
  return pages.find((p) => p.locale === locale) || pages[0];
}
export function SiteCanvasMarkup({
  project: sourceProject,
  sections: sourceSections,
  layout = true,
  pageId,
  siteKey,
  siteId,
  locale,
  selectLabel,
  rootLinks,
  children,
}: {
  project: Project;
  sections: Section[];
  layout?: boolean;
  pageId?: string;
  siteKey?: string;
  // Website id: enquiries of form-builder forms (SchemaForm) go to this website.
  siteId?: string;
  locale?: string;
  // Extra content after the sections (standalone service page).
  children?: ReactNode;
  // Editor only: accessible label of a selectable section.
  selectLabel?: (section: Section) => string | undefined;
  // Public page on the website's own domain: links without /site/{key} (custom domains).
  rootLinks?: boolean;
}) {
  // Forms that live in sections and services opened from collection items become website
  // forms/services; their buttons get actions (lib/builder/inline-content.ts).
  const { project, sections } = connectedContent(sourceProject, sourceSections);
  const forms = project.formDefinitions || [];
  const services = (project.services || []).filter(
    (s) => s.status === "Published",
  );
  return (
    <>
      {forms.length || services.length ? (
        <ContentDialogs
          forms={forms}
          services={services}
          pageId={pageId}
          siteId={siteId}
          locale={locale}
        />
      ) : null}
      {project.customCss ? (
        // Validated on save (no tags, imports or external URLs); written by the design team only.
        <style>{project.customCss}</style>
      ) : null}
      {layout && (
        <div className="builder-header-slot">
          <SectionRenderer
            section={{
              ...project.layout.header,
              values: localizedLayoutValues(project, "header", locale),
            }}
            project={project}
            siteKey={siteKey}
            siteId={siteId}
            pageId={pageId}
            locale={locale}
            rootLinks={rootLinks}
          />
        </div>
      )}
      <main className="builder-sections section-stack">
        {sections
          .filter((section) => !section.hidden)
          .map((section, i, shown) => (
            <SectionRenderer
              key={`${section.id}-${section.variant}`}
              section={section}
              project={project}
              siteKey={siteKey}
              siteId={siteId}
              pageId={pageId}
              locale={locale}
              rootLinks={rootLinks}
              // The H1 is the first section's main heading, or the next section's when that one is empty.
              first={i === (shown.length > 1 && mainHeadingIsEmpty(shown[0]) ? 1 : 0)}
              // Images of the first section are above the fold: loaded eagerly, the first one with high priority.
              lead={i === 0}
              selectLabel={selectLabel?.(section)}
            />
          ))}
        {children}
      </main>
      {layout && (
        <SectionRenderer
          section={{
            ...project.layout.footer,
            values: localizedLayoutValues(project, "footer", locale),
          }}
          project={project}
          siteKey={siteKey}
          siteId={siteId}
          pageId={pageId}
          locale={locale}
          rootLinks={rootLinks}
        />
      )}
    </>
  );
}
