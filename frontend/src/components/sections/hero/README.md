# Hero collection

Preview: `/hero.html`. Eight standalone HTML partials, one `hero.scss`, included using the existing Vite HTML-include pipeline. Legacy pages are unchanged.

Shared foundations: `src/styles/template/`. Containers, tokens, typography and buttons live there, not in a section. Always pair `heading heading--lg` or `text text--lg`; sizes are display/xl/lg/md/sm for headings and lg/md/sm/xs for text. All type sizes, including responsive values, belong in `_typography.scss`.

Each composition is one root modifier: signature, split, panorama, collage, centered, image-led, overlay, editorial. Overlay uses a compact bottom-left panel; editorial pairs a broad title with a smaller supporting photo. No Tailwind, inline styles, content-specific IDs in CSS, or text-size overrides in hero.scss. Responsive composition stays next to the section.

Images are local stock photographs from Unsplash, downloaded at implementation time:
- workspace.jpg: https://images.unsplash.com/photo-1497366754035-f200968a6e72
- studio.jpg: https://images.unsplash.com/photo-1497366811353-6870744d04b2
- details.jpg: https://images.unsplash.com/photo-1524758631624-e2822e304c36

Before Next integration: map the shared content fields (eyebrow, title, description, actions, media) to props; optional fields (tags, note, secondary media) remain optional. Demo links intentionally use email or local preview anchors; they are not a page-builder integration. Gallery page uses h2 for each hero under its own h1; on a real page use h1 for the selected first-screen title.

hero-v10 (intro): compact first screen without media for inner pages and shops — title, lead and up to five highlight pills (empty pills are hidden; all empty hides the row). Uses the shared tokens only.

- hero-v40 Inset Photo (anselat agent): full-height photo inset with rounded corners, large centred two-line title, bottom row with a short text and two buttons (accent + white outline). Pairs with header-v40 Overlay, which floats over it.
- hero-v41 Page Banner (anselat agent): inner-page banner on a blurred, darkened photo: breadcrumbs (Home / optional parent / current), big title, optional row of tab links (the link of the current page is underlined by the site script) and optional three label/value facts (date, place, type). Empty parts are hidden.

hero-v20 (page-title): inner-page title — breadcrumbs (home / optional parent / current; empty items hidden), heading (may be empty: then only breadcrumbs, e.g. above a product block) and one lead line. Height follows the content.

Library agent (v50…v59, 2026-11-19):
- hero-v50 Full-bleed: one photo across the whole first screen (edge to edge, min 560px / 100svh minus the header), dark scrim, big heading + text + two buttons bottom-left inside the page gutters. Empty text/buttons hide.
- hero-v51 Tall split: text column on the page grid + a tall photo that bleeds to the right edge of the screen; optional note pill (hours, address). On phones the photo follows the text inside the gutters.
- hero-v52 Video: muted, looping, inline background video (`video` field = a file of the website media, MP4/WebM up to 30 MB, uploaded in the editor) over a poster image (also the picture for `prefers-reduced-motion`, where the video is hidden and never played). Pause/play button bottom-right. No external video hosting. Sample `/images/hero/hero-loop.mp4` is a 13 s pan/zoom over three library photos made with ffmpeg.
