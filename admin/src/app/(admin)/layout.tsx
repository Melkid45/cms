import type { Metadata } from "next";
import { Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import "../globals.css";

// Admin type: Inter only (headings too, owner 2026-11-22). Playfair Display stays loaded for
// the editor canvas, where websites with the Playfair + Inter pair are previewed.
// Not preloaded: public website pages share this layout, and a website with another font pair
// would otherwise download these files ahead of its own hero image (site-fonts.ts does the same).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  weight: "700",
  subsets: ["latin", "latin-ext", "cyrillic"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://127.0.0.1:3000')),
  title: {
    default: "Harbstone CMS",
    template: "%s — Harbstone CMS",
  },
  description: "Harbstone website builder administration panel",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f6f6f6] text-[#111]">
        {children}
      </body>
    </html>
  );
}
