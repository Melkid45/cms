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
Responsive QA covers 390, 768, 1024 and 1440px; slider, timeline, FAQ, mobile menus
and local form validation have been exercised in the browser.
