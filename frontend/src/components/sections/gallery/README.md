# Gallery

Preview: /gallery-collection.html. Five standalone partials: grid, pair, mosaic, slider, panorama. One gallery.scss; shared Manrope/typography, 1820px container, radius, colors and 150px section-stack gap. No captions or preview chrome.

All photos reuse local Northline stock assets. Slider uses locally bundled Splide: loop, perMove 1, perPage 3 for cards or 1 for panorama, no arrows/pagination. Native dialog enlarges photos without cropping; Escape/close and focus return supported. Close icon: Lucide X (ISC). Include gallery-dialog.html and gallery.js once per page.

- gallery-v40 Justified (anselat agent): photos in rows of two sharing one height; the site script sizes each photo by its proportions (narrow + wide). Opens the shared lightbox.

gallery-v20 (carousel): heading + lead, round prev/next arrows, horizontal scroll-snap row of square photos (4 / 2 / 1.3 visible), optional "LIVE"-style badge per photo, optional centred button. Photos open in the lightbox.
gallery-v21 (badged): the same square tiles with badges as a 4/3/2-column grid; heading and button optional.

Library agent (v50…v59, 2026-11-19):
- gallery-v50 Compare: before/after pairs ("Comparisons", 1–30; one pair spans the full width). The divider is a native range input stretched over the photos, so mouse drag, touch and arrow keys work and it has an accessible label; the site script moves the divider (`--pos`). Labels "Before"/"After" and the caption are editable and hide when empty.
