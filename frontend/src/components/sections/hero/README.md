# Hero collection

Preview: `/hero.html`. Five standalone HTML partials, one `hero.scss`, included using the existing Vite HTML-include pipeline. Legacy pages are unchanged.

Shared foundations: `src/styles/template/`. Containers, tokens, typography and buttons live there, not in a section. Always pair `heading heading--lg` or `text text--lg`; sizes are display/xl/lg/md/sm for headings and lg/md/sm/xs for text. All type sizes, including responsive values, belong in `_typography.scss`.

Each composition is one root modifier: signature, split, panorama, collage, centered. No Tailwind, inline styles, content-specific IDs in CSS, or text-size overrides in hero.scss. Responsive composition stays next to the section. Preview labels and navigation belong only to `components/preview`.

Images are local stock photographs from Unsplash, downloaded at implementation time:
- workspace.jpg: https://images.unsplash.com/photo-1497366754035-f200968a6e72
- studio.jpg: https://images.unsplash.com/photo-1497366811353-6870744d04b2
- details.jpg: https://images.unsplash.com/photo-1524758631624-e2822e304c36

Before Next integration: map the shared content fields (eyebrow, title, description, actions, media) to props; optional fields (tags, note, secondary media) remain optional. Demo links intentionally use email or local preview anchors; they are not a page-builder integration. Gallery page uses h2 for each hero under its own h1; on a real page use h1 for the selected first-screen title.
