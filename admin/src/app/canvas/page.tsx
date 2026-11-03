"use client";
import { useEffect, useState } from "react";
import { SiteCanvas } from "@/components/builder/site-canvas";
import { seedProject } from "@/lib/builder/seed";
import type { Project, Section } from "@/lib/builder/types";
import "@/components/builder/site.scss";
export default function Canvas() {
  const [data, setData] = useState<{
    project: Project;
    sections: Section[];
    layout: boolean;
    editing?: boolean;
  } | null>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== parent ||
        event.origin !== location.origin ||
        event.data?.type !== "harbstone-preview"
      )
        return;
      setData(event.data.payload);
    };
    window.addEventListener("message", receive);
    parent.postMessage({ type: "harbstone-ready" }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  return data ? (
    <SiteCanvas
      key={JSON.stringify(data)}
      {...data}
      onSelectSection={
        data.editing
          ? (id) =>
              parent.postMessage(
                { type: "harbstone-select-section", id },
                location.origin,
              )
          : undefined
      }
    />
  ) : (
    <SiteCanvas project={seedProject()} sections={[]} layout={false} />
  );
}
