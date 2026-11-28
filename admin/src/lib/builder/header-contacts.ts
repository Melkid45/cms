import type { HeaderContact } from "./types";
export function headerContactHref(contact: HeaderContact) {
  const value = contact.value.trim();
  if (!value) return "";
  if (contact.type === "phone") {
    const n = value.replace(/[^+\d]/g, "");
    return /^\+?\d{5,18}$/.test(n) ? `tel:${n}` : "";
  }
  if (contact.type === "whatsapp") {
    const n = value.replace(/\D/g, "");
    return /^\d{5,18}$/.test(n) ? `https://wa.me/${n}` : "";
  }
  if (contact.type === "telegram") {
    const username = value
      .replace(/^https?:\/\/(?:www\.)?t\.me\//, "")
      .replace(/^@/, "")
      .replace(/\/$/, "");
    return /^[a-zA-Z0-9_]{5,32}$/.test(username)
      ? `https://t.me/${username}`
      : "";
  }
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
