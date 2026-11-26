// Font pairs a website can use: headings + body text. All free Google Fonts with
// Latin, Latvian (latin-ext) and Cyrillic letters, self-hosted by next/font
// (see components/builder/site-fonts.ts). The CSS variables are set there.
export const FONT_PAIRS = [
  {
    id: "editorial",
    label: "Playfair Display + Inter",
    heading: "--font-playfair",
    body: "--font-inter",
    weight: 700,
  },
  {
    id: "elegant",
    label: "Cormorant Garamond + Montserrat",
    heading: "--font-cormorant",
    body: "--font-montserrat",
    weight: 600,
  },
  {
    id: "warm",
    label: "Lora + Source Sans 3",
    heading: "--font-lora",
    body: "--font-source-sans",
    weight: 700,
  },
  {
    id: "classic",
    label: "PT Serif + PT Sans",
    heading: "--font-pt-serif",
    body: "--font-pt-sans",
    weight: 700,
  },
  {
    id: "modern",
    label: "Montserrat + Inter",
    heading: "--font-montserrat",
    body: "--font-inter",
    weight: 700,
  },
  {
    id: "clean",
    label: "Manrope",
    heading: "--font-manrope",
    body: "--font-manrope",
    weight: 700,
  },
  {
    id: "friendly",
    label: "Nunito",
    heading: "--font-nunito",
    body: "--font-nunito",
    weight: 800,
  },
  {
    id: "bold",
    label: "Oswald + Roboto",
    heading: "--font-oswald",
    body: "--font-roboto",
    weight: 600,
  },
  {
    id: "tech",
    label: "Unbounded + Inter",
    heading: "--font-unbounded",
    body: "--font-inter",
    weight: 600,
  },
  {
    // DM Serif Text has no Cyrillic: Russian headings fall back to Georgia.
    id: "serif-jakarta",
    label: "DM Serif Text + Plus Jakarta Sans",
    heading: "--font-dm-serif",
    body: "--font-jakarta",
    weight: 400,
  },
  {
    id: "raleway",
    label: "Raleway + Open Sans",
    heading: "--font-raleway",
    body: "--font-open-sans",
    weight: 700,
  },
  {
    id: "raleway-only",
    label: "Raleway",
    heading: "--font-raleway",
    body: "--font-raleway",
    weight: 700,
  },
  {
    id: "inter",
    label: "Inter",
    heading: "--font-inter-opsz",
    body: "--font-inter-opsz",
    weight: 400,
  },
  {
    // Zcena: Inter Tight headings (heavy, tight) over Inter text.
    id: "tight",
    label: "Inter Tight + Inter",
    heading: "--font-inter-tight",
    body: "--font-inter",
    weight: 800,
  },
] as const;
export type FontPairId = (typeof FONT_PAIRS)[number]["id"];
export const FONT_PAIR_IDS = FONT_PAIRS.map((p) => p.id) as [
  FontPairId,
  ...FontPairId[],
];
export const DEFAULT_FONT_PAIR: FontPairId = "editorial";
// CSS variables for the .site-canvas root.
export function fontPairVars(id?: string): Record<string, string> {
  const pair =
    FONT_PAIRS.find((p) => p.id === id) ||
    FONT_PAIRS.find((p) => p.id === DEFAULT_FONT_PAIR)!;
  return {
    "--font-heading": `var(${pair.heading}), Georgia, serif`,
    "--font-body": `var(${pair.body}), Inter, sans-serif`,
    "--font-heading-weight": String(pair.weight),
  };
}

// Individual font choices reuse the same self-hosted faces as the existing pairs.
export const WEBSITE_FONTS = [
  ["manrope", "Manrope", "--font-manrope"],
  ["inter", "Inter", "--font-inter"],
  ["inter-tight", "Inter Tight", "--font-inter-tight"],
  ["montserrat", "Montserrat", "--font-montserrat"],
  ["lora", "Lora", "--font-lora"],
  ["source-sans", "Source Sans 3", "--font-source-sans"],
  ["playfair-display", "Playfair Display", "--font-playfair"],
  ["cormorant-garamond", "Cormorant Garamond", "--font-cormorant"],
  ["pt-serif", "PT Serif", "--font-pt-serif"],
  ["pt-sans", "PT Sans", "--font-pt-sans"],
  ["nunito", "Nunito", "--font-nunito"],
  ["oswald", "Oswald", "--font-oswald"],
  ["roboto", "Roboto", "--font-roboto"],
  ["unbounded", "Unbounded", "--font-unbounded"],
  ["dm-serif", "DM Serif Text", "--font-dm-serif"],
  ["jakarta", "Plus Jakarta Sans", "--font-jakarta"],
  ["raleway", "Raleway", "--font-raleway"],
  ["open-sans", "Open Sans", "--font-open-sans"],
] as const;
export function websiteFontFamily(id?: string) {
  const font = WEBSITE_FONTS.find(([key]) => key === id);
  return font ? `var(${font[2]}), "${font[1]}", sans-serif` : undefined;
}
export function websiteFontVars(brand: {
  headingFont?: string;
  bodyFont?: string;
}) {
  const heading = websiteFontFamily(brand.headingFont),
    body = websiteFontFamily(brand.bodyFont);
  return {
    ...(heading ? { "--font-heading": heading } : {}),
    ...(body ? { "--font-body": body } : {}),
  };
}
