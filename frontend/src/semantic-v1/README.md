# Semantic v1 — styling trial

Open `/semantic-v1.html`. The original `/index-v2.html` and both other landing
versions are untouched. This is a review prototype, not an admin migration.

## Taken from Harbstone

The local reference is `harbstone/harbstone/app`: shared foundations in
`assets/_styles`, component SCSS and BEM elements/modifiers. This trial uses the
same separation, without copying its dimensions or decorative treatments.

- `common/`: shared tokens, reset, typography, container, grid, section skeleton
  and buttons in separate named files. `common/index.scss` is the shared entry.
- `blocks/programs/programs.html` and `programs.scss` (same structure for each
  block): editable markup beside its own styles and responsive rules.
- Each block HTML declares `<link rel="stylesheet" href="./programs.scss">`.
  The existing Vite include pipeline collects and deduplicates those links into
  the page head. Adding an include automatically adds the block's stylesheet.
- There is no central component stylesheet list and no Tailwind/old utility CSS.
- `index.js`: original v1 timeline/slider/FAQ/form logic, plus the header toggle.

Content editors change text, image `src`/`alt` and links. They do not need to
compose grids or pick responsive utility classes. Custom visual changes belong
in the adjacent component SCSS. Shared spacing changes belong in
`common/_tokens.scss`. `common/_grid.scss` and the CSS-free `_mixins.scss` define
equal columns, one gap token and common 1024/768px responsive rules. Programs
uses this same contract through a mixin, keeping its HTML semantic.
The container restores v1's 1920px cap and 24–72px fluid gutters. Numbers and
Reviews no longer override the shared 1fr/1fr layout. Hero, gallery and timeline
retain their explicit full-bleed/mosaic/scrolling compositions.
Buttons, card surfaces and bordered FAQ items share `--radius: 8px`; FAQ has no
grey background. Editorial cards intentionally have no surrounding surface.

## One modifier changes a block

In `blocks/programs/programs.html`, replace only `programs--cards` with
`programs--editorial` on the section. The same three articles become an editorial
composition: taller images, no card backgrounds and staggered desktop positions.
Both variants have their own mobile rules. No child classes or content change.

`block` is shared section spacing, `programs` identifies the component, and
`programs--cards` selects the composition. Child names describe their role:
`programs__list`, `programs__item`, `programs__image`, `programs__content`.
The modifier is a layout preset, not a second utility system. Other sections
currently have one preset; additional presets should be added after review.

The generic section skeleton remains for simple content groups; distinct
components (timeline, pricing, gallery, forms) retain their own semantic rules.
JavaScript hooks stay in `data-*`, independent of styling choices.

## Checks

From `frontend`: `npm run build`, then
`node scripts/check-semantic-v1.mjs`.
Contact submission remains a local validation demo; no request is sent.
