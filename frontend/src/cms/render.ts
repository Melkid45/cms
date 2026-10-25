import { getDefinition, safeUrl, type BlockContent } from "./schema";
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
export function renderBlock(source: string, data: BlockContent, assets: Record<string, string>): string {
  const definition = getDefinition(source);
  if (!definition) return "";
  const editorial = source.endsWith("editorial");
  const resolveImage = (value: string) => value.startsWith("asset:") ? assets[value.slice(6)] ?? "" : safeUrl(value, true);
  const image = (url: string, alt: string, classes = "aspect-[5/4]") => { const src = resolveImage(url); return src ? `<img class="w-full object-cover ${classes}" src="${escape(src)}" alt="${escape(alt)}" loading="lazy">` : ""; };
  const action = (label: string, url: string) => { const href = safeUrl(url); return label.trim() && href ? `<a class="cms-button" href="${escape(href)}">${escape(label)} <span aria-hidden="true">↗</span></a>` : ""; };
  const heading = `${data.eyebrow ? `<p class="cms-eyebrow">${escape(data.eyebrow)}</p>` : ""}${data.title ? `<h2 class="cms-heading">${escape(data.title)}</h2>` : ""}${data.text ? `<p class="cms-copy mt-6 whitespace-pre-line">${escape(data.text)}</p>` : ""}${action(data.buttonLabel, data.buttonUrl)}`;
  let body = "";
  if (definition.family === "about" || definition.family === "photo") {
    const wide = editorial || source.endsWith("wide");
    const media = image(data.image, data.imageAlt, wide ? "aspect-[16/9]" : source.endsWith("profile") ? "aspect-[4/5]" : "aspect-[5/4]");
    body = wide ? `<div class="grid gap-8 @3xl:grid-cols-[1fr_2fr]"><div>${data.eyebrow ? `<p class="cms-eyebrow">${escape(data.eyebrow)}</p>` : ""}</div><div>${data.title ? `<h2 class="cms-heading">${escape(data.title)}</h2>` : ""}${data.text ? `<p class="cms-copy mt-6 max-w-2xl whitespace-pre-line">${escape(data.text)}</p>` : ""}${action(data.buttonLabel,data.buttonUrl)}</div></div>${media ? `<div class="mt-10">${media}</div>` : ""}` : `<div class="${media ? "grid items-center gap-10 @3xl:grid-cols-2 @3xl:gap-14" : "max-w-3xl"}">${media}<div>${heading}</div></div>`;
  } else if (definition.family === "services") {
    body = `<div class="mb-10 max-w-3xl">${heading}</div><div class="grid gap-8 @xl:grid-cols-2 @4xl:grid-cols-3">${data.items.map((item, index) => `<article class="flex flex-col ${editorial ? (index % 3 === 1 ? "@4xl:pt-12" : index % 3 === 2 ? "@4xl:pt-24" : "") : "overflow-hidden rounded-lg border border-current/15"}">${image(item.image,item.imageAlt,editorial ? "aspect-[4/5]" : "aspect-[4/3]")}<div class="flex flex-1 flex-col ${editorial ? "pt-5" : "p-6"}"><h3 class="text-2xl font-medium tracking-tight">${escape(item.title)}</h3><p class="cms-copy mt-3 mb-6 text-base">${escape(item.text)}</p><div class="mt-auto">${action(item.buttonLabel,item.buttonUrl)}</div></div></article>`).join("")}</div>`;
  } else if (definition.family === "column-text") {
    const list = source.endsWith("list");
    body = `<div class="grid gap-12 @3xl:grid-cols-[1fr_1.4fr]"><div>${heading}</div><div class="grid gap-8 ${list ? "" : "@xl:grid-cols-2"}">${data.items.map((item,index)=>`<article class="border-t border-current/20 pt-5 ${list ? "grid grid-cols-[32px_1fr] gap-5" : ""}"><span class="text-xs opacity-50">${String(index+1).padStart(2,"0")}</span><div><h3 class="mt-3 text-xl font-medium">${escape(item.title)}</h3><p class="cms-copy mt-3 text-base">${escape(item.text)}</p></div></article>`).join("")}</div></div>`;
  } else {
    const story = source.endsWith("story");
    const figures = data.items.map((item)=>`<div class="border-t border-current/20 pt-6"><dt class="cms-copy text-sm">${escape(item.text)}</dt><dd class="mt-3 text-5xl font-medium tracking-tight @3xl:text-6xl">${escape(item.title)}</dd></div>`).join("");
    body = story ? `<div class="grid gap-12 @3xl:grid-cols-2"><div>${heading}</div><dl class="grid gap-8">${figures}</dl></div>` : `<div class="max-w-3xl">${heading}</div><dl class="mt-12 grid gap-8 @xl:grid-cols-2 @3xl:grid-cols-3">${figures}</dl>`;
  }
  return `<section class="cms-section ${data.theme === "dark" ? "bg-neutral-950 text-white" : data.theme === "soft" ? "bg-[#f4f4f1] text-neutral-950" : "bg-white text-neutral-950"}"><div class="cms-shell">${body}</div></section>`;
}
