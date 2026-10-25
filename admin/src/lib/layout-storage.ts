import {
  defaultLayout,
  headerVariants,
  footerVariants,
  type SiteLayout,
} from "../../../frontend/src/cms/layout";
import { normalizeMenu } from "./menu-tree";
const key = "harbstone:layout:v1";
const event = "harbstone:layout-changed";
export function layoutSnapshot() {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
export function subscribeLayout(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(event, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(event, listener);
  };
}
export function readLayout(raw: string): SiteLayout {
  try {
    const data = JSON.parse(raw),
      value = data.layout;
    if (
      data.version !== 1 ||
      !value ||
      !headerVariants.some((item) => item.id === value.header) ||
      !footerVariants.some((item) => item.id === value.footer)
    )
      return structuredClone(defaultLayout);
    if (
      ![
        "brand",
        "tagline",
        "email",
        "actionLabel",
        "actionUrl",
        "copyright",
      ].every(
        (field) =>
          typeof value[field] === "string" && value[field].length <= 2000,
      )
    )
      return structuredClone(defaultLayout);
    for (const field of ["phone", "address", "hours"] as const) {
      if (value[field] === undefined) value[field] = defaultLayout[field];
      if (typeof value[field] !== "string" || value[field].length > 2000)
        return structuredClone(defaultLayout);
    }
    for (const type of ["header", "footer"] as const) {
      if (
        !Array.isArray(value.menus?.[type]) ||
        value.menus[type].length > 100 ||
        !value.menus[type].every(
          (item: { slug: string; label: string; parentSlug?: string }) =>
            item &&
            typeof item.slug === "string" &&
            /^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.slug) &&
            typeof item.label === "string" &&
            (item.parentSlug === undefined ||
              typeof item.parentSlug === "string"),
        )
      )
        return structuredClone(defaultLayout);
      value.menus[type] = normalizeMenu(value.menus[type]);
    }
    return value;
  } catch {
    return structuredClone(defaultLayout);
  }
}
export function saveLayout(layout: SiteLayout) {
  localStorage.setItem(key, JSON.stringify({ version: 1, layout }));
  window.dispatchEvent(new Event(event));
}
