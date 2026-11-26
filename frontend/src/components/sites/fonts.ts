export const websiteFonts = [
  { value: "manrope", label: "Manrope", serif: false },
  { value: "inter", label: "Inter", serif: false },
  { value: "lora", label: "Lora", serif: true },
  { value: "source-sans", label: "Source Sans 3", serif: false },
  { value: "montserrat", label: "Montserrat", serif: false },
  { value: "onest", label: "Onest", serif: false },
  { value: "golos-text", label: "Golos Text", serif: false },
  { value: "rubik", label: "Rubik", serif: false },
  { value: "nunito-sans", label: "Nunito Sans", serif: false },
  { value: "open-sans", label: "Open Sans", serif: false },
  { value: "roboto", label: "Roboto", serif: false },
  { value: "raleway", label: "Raleway", serif: false },
  { value: "oswald", label: "Oswald", serif: false },
  { value: "playfair-display", label: "Playfair Display", serif: true },
  { value: "cormorant-garamond", label: "Cormorant Garamond", serif: true },
  { value: "pt-serif", label: "PT Serif", serif: true },
  { value: "merriweather", label: "Merriweather", serif: true },
  { value: "roboto-slab", label: "Roboto Slab", serif: true },
] as const;
export type WebsiteFont = (typeof websiteFonts)[number]["value"];
export const websiteFontIds = websiteFonts.map((font) => font.value) as [
  WebsiteFont,
  ...WebsiteFont[],
];
export function fontFamily(value?: WebsiteFont) {
  const font =
    websiteFonts.find((font) => font.value === value) || websiteFonts[0];
  return `"${font.label}", ${font.serif ? "serif" : '"Manrope Variable", sans-serif'}`;
}
export function fontStylesheet(values: (WebsiteFont | undefined)[]) {
  const fonts = [...new Set(values.map((value) => value || "manrope"))]
    .map((value) => websiteFonts.find((font) => font.value === value))
    .filter((font) => font !== undefined)
    .sort((a, b) => a.label.localeCompare(b.label));
  return `https://fonts.googleapis.com/css2?${fonts.map((font) => `family=${encodeURIComponent(font.label).replace(/%20/g, "+")}:wght@${font.value === "pt-serif" ? "400;700" : "400;500;600;700"}`).join("&")}&display=swap`;
}
