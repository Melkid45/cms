// Safe link / image URL check, without the block catalogue: client code on public pages
// (site runtime, form-builder forms, cart window) imports it from here so catalog.json stays
// out of their bundle. Re-exported by catalog.ts.
export function safeUrl(value: string, image = false) {
  if (!value || /[\u0000-\u0020\\]/.test(value)) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (!image && value.startsWith("#")) return value;
  try {
    return (image
      ? ["https:", "http:"]
      : ["https:", "http:", "mailto:", "tel:"]
    ).includes(new URL(value).protocol)
      ? value
      : "";
  } catch {
    return "";
  }
}
