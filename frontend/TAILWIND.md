# Tailwind exploration

Open `/design-preview.html` with `npm run dev` to compare the first seven blocks
of `index-v2.html`: Hero, Partners, Numbers, Programs, Coach, Timeline, Included.
Original content and images are reused; typography, spacing and colors are shared.
Version 2 stays at `/design-preview.html`; Version 3 is a separate exploration
at `/design-preview-v3.html`, with its own partials under `experimental/v3/`.
Both use `src/preview-timeline.js`, matching the original timeline:
3 visible milestones on desktop, animated progress, automatic year advancement,
selection by click, arrow keys and touch/trackpad scrolling. Autoplay pauses on
hover, focus and hidden tabs, and is disabled for reduced-motion preferences.
The line continues to the track edge after the final milestone.
The existing pages continue to use `src/styles/index.scss`; the preview loads
only `src/styles/tailwind.css` and its own HTML partials.

Tailwind is compiled through `@tailwindcss/vite`, without a CDN or runtime.
The CSS source list is explicit so legacy markup does not generate utilities.
Add new Tailwind partials under `src/_components/experimental/` for now.

The theme defines paper, ink, muted, line, accent and surface colors.
Use those tokens instead of embedding a new palette into each block.
`page-shell` and `section-space` provide the shared container and section rhythm;
composition and responsive behavior use Tailwind utilities directly.

Manrope Variable is served locally through `@fontsource-variable/manrope`,
including Latin and Cyrillic. Font licensing is included in the package.

This page is a visual prototype: copy and metrics are sample content, and contact
links use an example email address. It is not connected to the admin page builder.
Approve the direction before converting the rest of the block library.

Version 3's editorial labels, photo captions, coach quote, staggered program
cards and dark benefits section are preset composition choices, not a set of
per-element controls for the admin. The visual prototype still uses sample links.
