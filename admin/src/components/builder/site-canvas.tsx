"use client";
import { useMemo, useRef, type ReactNode } from "react";
import type { Project, Section } from "@/lib/builder/types";
import { sectionInfo } from "@/lib/builder/section-info";
import { pageHref } from "@/lib/builder/i18n";
import {
  SiteCanvasMarkup,
  canvasRootProps,
  cartLookOf,
  checkoutTarget,
  checkoutPopupOf,
} from "./site-canvas-markup";
import { RuntimeCart, useLightbox, useSiteRuntime, type SiteRuntimeOptions } from "./site-runtime";
import { siteFontVariables } from "./site-fonts";
// Website canvas rendered in the browser: editor preview, library pages and /canvas.
// Public pages render the same markup on the server instead (SitePublicCanvas) and ship only
// the runtime (site-runtime.tsx), not the templates and the project.
export function SiteCanvas({
  project,
  sections,
  layout = true,
  pageId,
  siteId,
  siteKey,
  locale,
  onSelectSection,
  children,
}: {
  project: Project;
  sections: Section[];
  layout?: boolean;
  pageId?: string;
  // Website id for enquiry forms and public key for page links (multi-site).
  siteId?: string;
  siteKey?: string;
  // Page language (multilingual websites): header/footer texts, menus, switcher, form notices.
  locale?: string;
  onSelectSection?: (id: string) => void;
  // Extra content after the sections (standalone service page).
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const checkoutPage = checkoutTarget(project, locale);
  // Behaviours re-mount whenever the editor renders new markup.
  const version = useMemo(() => ({}), [project, sections, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const options: SiteRuntimeOptions = {
      siteId,
      pageId,
      locale,
      lang: locale || project.languages?.default,
      formsOff: project.forms?.enabled === false,
      checkout: checkoutPage && {
        id: checkoutPage.id,
        href: pageHref(project, siteKey, checkoutPage),
      },
      cartLook: cartLookOf(project),
      checkoutPopup: checkoutPopupOf(project),
  };
  useSiteRuntime(root, options, version);
  const { onClick, dialog } = useLightbox();
  const rootProps = canvasRootProps(project, locale);
  return (
    <div
      ref={root}
      {...rootProps}
      className={`${rootProps.className} ${siteFontVariables}`}
      data-select-sections={onSelectSection ? "true" : undefined}
      onClickCapture={(event) => {
        if (!onSelectSection) return;
        event.preventDefault();
        event.stopPropagation();
        const section = (event.target as Element).closest<HTMLElement>(
          "main [data-section-id]",
        );
        if (section) onSelectSection(section.dataset.sectionId!);
      }}
      onKeyDownCapture={(event) => {
        if (!onSelectSection || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const section = (event.target as Element).closest<HTMLElement>(
          "main [data-section-id]",
        );
        if (section) onSelectSection(section.dataset.sectionId!);
      }}
      onClick={onClick}
    >
      <SiteCanvasMarkup
        project={project}
        sections={sections}
        layout={layout}
        pageId={pageId}
        siteKey={siteKey}
        siteId={siteId}
        locale={locale}
        selectLabel={
          onSelectSection
            ? (section) => `Edit ${sectionInfo(section).title}`
            : undefined
        }
      >
        {children}
      </SiteCanvasMarkup>
      {dialog}
      <RuntimeCart options={options} />
    </div>
  );
}
