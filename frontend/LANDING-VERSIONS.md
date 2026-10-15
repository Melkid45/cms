# Client style comparison

All three pages contain the same 14 sections in the same order, followed by a contact footer:
hero, partners, approach/statistics, programs, coach, timeline, included services,
studio, results, pricing, first-session CTA, FAQ, testimonials, insights.

- `/index-v2.html`: original utility-system layout.
- `/design-preview.html`: quiet Tailwind layout, restrained cards and soft surfaces.
- `/design-preview-v3.html`: editorial Tailwind layout, staggered compositions,
  a portrait gallery, row-based pricing, larger quotes and quieter outlines.

The form validates name, phone and consent locally. It does not deliver a request.
Pricing, statistics, testimonials and results are sample presentation content.
No video file was supplied, so the studio section uses photography instead of an
inactive play button. Insights expand locally; no missing article pages are linked.

Run `npm run build` and `node scripts/check-landings.mjs` from `frontend`.
Responsive spacing uses a shared fluid scale: 88px per section edge at 1920px,
64px at 1440px, 41px at 1024px and 32px on narrow screens. Structural gaps and
headings scale independently from readable body text. Editorial image offsets
use the same spacing scale rather than fixed 64/128px steps.

All hero compositions share a viewport-height contract that includes the header.
Portrait tablets and phones stack copy above the available image area. Desktop
and short landscape screens retain two columns. Decorative hero labels disappear
on small/short screens instead of reducing body copy below 16px.

Responsive QA includes 1920×1080, 1440×900, 1440×800, 1366×768, 1024×768,
768×1024, 390×844, 375×667, 320×568 and 844×390. Check actual hero content
bounds and image area, not just document overflow. Slider, timeline, FAQ, mobile
menus and local form validation have also been exercised in the browser.
