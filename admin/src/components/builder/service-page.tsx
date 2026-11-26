/* eslint-disable @next/next/no-img-element */
import type { CmsService, Project } from "@/lib/builder/types";
import { SchemaForm } from "./schema-form";
import { safeUrl } from "@/lib/builder/safe-url";
// Standalone service page (button action "page"/"editorial", origin/main): rendered inside the
// website canvas after the header (public-service.tsx). The enquiry form posts with
// pageId "service:{id}" to the service's website.
export function ServiceArticle({
  project,
  service,
  homeHref,
  siteId,
  locale,
}: {
  project: Project;
  service: CmsService;
  homeHref: string;
  siteId?: string;
  locale?: string;
}) {
  const form = project.formDefinitions?.find((f) => f.id === service.formId);
  return (
    <article className={`service-page service-page--${service.mode}`}>
      <div className="container">
        <div className="service-page__grid">
          <div className="service-content">
            <a className="text-link text text--sm" href={homeHref}>
              Back to website
            </a>
            <h1 className="heading heading--xl">{service.title}</h1>
            <p className="text text--lg">{service.summary}</p>
            <div className="text text--md service-content__body">
              {service.body}
            </div>
            {form && (
              <a className="button button--dark" href="#service-enquiry">
                Discuss this service
              </a>
            )}
          </div>
          {service.image && (
            <img
              className="service-page__image"
              src={safeUrl(service.image, true)}
              alt={service.imageAlt}
            />
          )}
        </div>
        {form && (
          <div id="service-enquiry" className="service-page__form">
            <SchemaForm
              definition={form}
              pageId={`service:${service.id}`}
              sectionId={`service:${service.id}`}
              serviceId={service.id}
              siteId={siteId}
              locale={locale}
            />
          </div>
        )}
      </div>
    </article>
  );
}
