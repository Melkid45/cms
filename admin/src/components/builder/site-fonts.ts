import {
  Cormorant_Garamond,
  DM_Serif_Text,
  Inter,
  Inter_Tight,
  Lora,
  Manrope,
  Montserrat,
  Nunito,
  Open_Sans,
  Oswald,
  PT_Sans,
  PT_Serif,
  Plus_Jakarta_Sans,
  Raleway,
  Roboto,
  Source_Sans_3,
  Unbounded,
} from "next/font/google";
// Extra website fonts (Inter and Playfair come from the root layouts: app/site/layout.tsx for public pages, app/(admin)/layout.tsx for the admin and the editor canvas). Not preloaded:
// the browser downloads only the pair the website uses (lib/builder/font-pairs.ts).
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["600"],
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const ptSans = PT_Sans({
  variable: "--font-pt-sans",
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
// Inter with the optical-size axis (display cut at large sizes), used by the "Inter" pair.
const interOpsz = Inter({
  variable: "--font-inter-opsz",
  axes: ["opsz"],
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const dmSerif = DM_Serif_Text({
  variable: "--font-dm-serif",
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
  preload: false,
});
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext", "cyrillic-ext"],
  preload: false,
});
// Raleway + Open Sans (enrina).
const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  weight: ["600", "700", "800"],
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});
export const siteFontVariables = [
  interTight,
  raleway,
  openSans,
  cormorant,
  montserrat,
  lora,
  sourceSans,
  ptSerif,
  ptSans,
  manrope,
  nunito,
  oswald,
  roboto,
  unbounded,
  dmSerif,
  jakarta,
  interOpsz,
]
  .map((font) => font.variable)
  .join(" ");
