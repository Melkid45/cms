# Projects / case studies

Preview: /projects-collection.html. Five partials share projects.scss: grid, pair, list, feature, slider. No preview header/footer/labels. Typography and UI reuse src/styles/template; section-stack supplies 150px gaps.

Slider uses locally bundled Splide core, loop, perPage 3, perMove 1, no arrows/pagination (same settings as services). Project buttons open one shared native dialog: include project-dialog.html once and projects.js once. Escape, close button and focus return supported. Demonstration descriptions are in project-data.js; map to CMS routes/data during Next integration. All projects/statistics are fictional, not client claims.

New local stock images:
- atelier.jpg: https://images.unsplash.com/photo-1497366858526-0766cadbe8fa
- common.jpg: https://images.unsplash.com/photo-1497366412874-3415097a27e7

Other images reuse the approved Northline stock assets from hero. No new font-size rules or decorative icons.

projects-v9 (live sites): six cards, each a real link to an example website (image and "View website"). Hover is a soft shadow only. Made for the Harbstone landing, works for any portfolio of live sites.

- projects-v40 Overlay Cards (anselat agent): heading + accent button, then square photo tiles with title and two-line text over a dark gradient; more than two tiles scroll sideways (scroll-snap). Whole tile is a link.
- projects-v41 Category Cards (anselat agent): large heading with a description beside it, then 4:3 photo tiles in two columns (same tile as v40). Use one per category for a works listing; tiles without a link work as plain cards (materials).
