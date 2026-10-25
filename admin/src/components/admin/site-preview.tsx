"use client";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import {
  renderHeader,
  renderFooter,
  type SiteLayout,
} from "../../../../frontend/src/cms/layout";
import {
  layoutSnapshot,
  subscribeLayout,
  readLayout,
} from "@/lib/layout-storage";
import { getDefinition, renderBlock } from "@/lib/cms-library";
import { cmsAssets } from "@/lib/cms-assets";
import type { PageBlock } from "@/lib/example-pages";
import { bindSiteNavigation } from "../../../../frontend/src/cms/navigation";
export function SitePreview({
  blocks,
  layout: draft,
}: {
  blocks: PageBlock[];
  layout?: SiteLayout;
}) {
  const raw = useSyncExternalStore(subscribeLayout, layoutSnapshot, () => "");
  const layout = draft ?? readLayout(raw);
  const headerHtml = renderHeader(layout);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const slot = headerRef.current;
    const header = slot?.querySelector<HTMLElement>("[data-site-header]");
    if (!root || !slot || !header) return;
    const scroller = root.closest<HTMLElement>("[data-preview-scroll]");
    const unbindNavigation = bindSiteNavigation(header, scroller);
    const dialog = header.querySelector<HTMLDialogElement>("[data-site-menu]");
    const update = () => {
      const rect = root.getBoundingClientRect();
      const viewport = scroller?.getBoundingClientRect();
      const top = Math.max(rect.top, viewport?.top ?? 0);
      header.style.top = `${top}px`;
      header.style.left = `${rect.left}px`;
      header.style.right = "auto";
      header.style.width = `${rect.width}px`;
      if (dialog) {
        dialog.style.left = `${rect.left}px`;
        const menuTop = top + header.getBoundingClientRect().height;
        dialog.style.top = `${menuTop}px`;
        dialog.style.width = `${rect.width}px`;
        dialog.style.height = `${Math.max(0, (viewport?.bottom ?? window.innerHeight) - menuTop)}px`;
        if (rect.width > 1024 && dialog.open) dialog.close();
      }
      header.style.visibility =
        rect.bottom <= top || top >= (viewport?.bottom ?? window.innerHeight)
          ? "hidden"
          : "visible";
      const left = Math.max(0, (viewport?.left ?? 0) - rect.left);
      const right = Math.max(
        0,
        rect.right - (viewport?.right ?? window.innerWidth),
      );
      header.style.clipPath =
        left || right ? `inset(0 ${right}px -100vh ${left}px)` : "none";
      slot.style.height = `${header.getBoundingClientRect().height}px`;
      root.style.setProperty(
        "--cms-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(root);
    observer.observe(header);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      unbindNavigation();
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [headerHtml]);
  const coachIndex = blocks.findIndex(
    (block) => getDefinition(block.source)?.family === "photo",
  );
  return (
    <div
      ref={rootRef}
      className="cms-site @container bg-white text-neutral-900"
    >
      <div
        ref={headerRef}
        className="min-h-20"
        dangerouslySetInnerHTML={{ __html: headerHtml }}
      />
      <div>
        {blocks.map((block, index) =>
          block.content ? (
            <div
              id={index === coachIndex ? "coach" : undefined}
              key={block.key}
              dangerouslySetInnerHTML={{
                __html: renderBlock(block.source, block.content, cmsAssets),
              }}
            />
          ) : (
            <div
              key={block.key}
              className="border-y border-dashed bg-neutral-50 px-6 py-8 text-center text-sm text-neutral-500"
            >
              {block.family} / {block.variant} · Legacy layout, not connected
              yet
            </div>
          ),
        )}
        {!blocks.length && (
          <div className="p-12 text-center text-sm text-neutral-400">
            Page content appears here.
          </div>
        )}
      </div>
      <div dangerouslySetInnerHTML={{ __html: renderFooter(layout) }} />
    </div>
  );
}

export function BlockThumbnail({ source }: { source: string }) {
  const definition = getDefinition(source);
  if (!definition)
    return (
      <div
        aria-hidden="true"
        className="grid h-32 place-items-center border-b bg-neutral-50 text-xs text-neutral-400"
      >
        Legacy layout
      </div>
    );
  const html = renderBlock(source, definition.defaultContent, cmsAssets)
    .replace(/<a\b[^>]*>/g, "<span>")
    .replace(/<\/a>/g, "</span>");
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-32 overflow-hidden border-b bg-white"
    >
      <div
        className="cms-site @container absolute top-0 left-0 w-[400%] origin-top-left scale-[0.25]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
