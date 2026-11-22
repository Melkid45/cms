"use client";
/* eslint-disable @next/next/no-img-element */
import type { CmsService, Project } from "@/lib/builder/types";
import { SiteCanvas } from "./site-canvas";
import { SchemaForm } from "./schema-form";
import { safeUrl } from "@/lib/builder/catalog";
export function ServicePage({
  project,
  service,
}: {
  project: Project;
  service: CmsService;
}) {
  const form = project.formDefinitions?.find((f) => f.id === service.formId);
  return (
    <SiteCanvas
      project={project}
      sections={[]}
      pageId={`service:${service.id}`}
    >
      <article className={`service-page service-page--${service.mode}`}>
        <div className="container">
          <div className="service-page__grid">
            <div className="service-content">
              <a
                className="text-link text text--sm"
                href={`/site/${project.pages.find((p) => p.id === project.layout.homePageId)?.slug || project.pages[0]?.slug || "home"}`}
              >
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
              />
            </div>
          )}
        </div>
      </article>
    </SiteCanvas>
  );
}
