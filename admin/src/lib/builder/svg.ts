import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
// Normalize vector logos to inert raster assets. Never serve uploaded SVG markup.
export function safeSvg(source: string): Buffer {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error("SVG document declarations are not supported.");
  const document = new DOMParser({
    onError: () => {
      throw new Error("Invalid SVG.");
    },
  }).parseFromString(source, "image/svg+xml");
  if (document.documentElement?.localName !== "svg")
    throw new Error("Not an SVG image.");
  const allowed = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "polygon",
    "polyline",
    "line",
    "defs",
    "clipPath",
    "mask",
    "linearGradient",
    "radialGradient",
    "stop",
    "symbol",
    "use",
    "text",
    "tspan",
    "title",
    "desc",
    "metadata",
  ]);
  for (const node of Array.from(document.getElementsByTagName("*"))) {
    if (!allowed.has(node.localName || ""))
      throw new Error(
        "Export a plain SVG without scripts, filters or embedded content.",
      );
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name))
        throw new Error("SVG event handlers are not allowed.");
      if (attribute.localName === "href" && !attribute.value.startsWith("#"))
        throw new Error("SVG external resources are not allowed.");
      const value = attribute.value.replace(
        /url\(\s*['"]?#[\w:.-]+['"]?\s*\)/gi,
        "",
      );
      if (/url\s*\(|@import|expression\s*\(|\\/i.test(value))
        throw new Error("SVG external styles are not allowed.");
    }
  }
  return Buffer.from(
    new XMLSerializer().serializeToString(document.documentElement),
  );
}
