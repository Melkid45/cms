# Styles architecture

The global stylesheet is assembled in `index.scss` in the same order as the CSS layers:

1. `reset` — browser normalization.
2. `tokens` — colors, type scale, spacing, radii, motion, and layout values.
3. `base` — styles for document-level elements only.
4. `layout` — container and section primitives.
5. `typography` — heading and text variants.
6. `components` — buttons and other reusable UI components.
7. `blocks` / `pages` — styles that belong to one section or page.
8. `utilities` — grid, flex, spacing, aspect ratio, and token-based colors.

## Rules

- Add a reusable value to `_tokens.scss` instead of copying a number between files.
- Use `px` for fixed dimensions and breakpoints. Keep `%`, `vw` and `fr` only where the value is intentionally relative or fluid.
- Keep utilities single-purpose. A section-specific visual rule belongs next to that section.
- Utilities must not change meaning at a breakpoint. Responsive behavior is always opt-in.
- Use semantic names for repeated elements: `media-placeholder`, `divider`, `grid--span-2`.
- Keep component states (`hover`, `focus-visible`, `disabled`) with the component.
- Prefer `gap` for spacing between children and padding utilities for spacing inside a component.
- Blocks use container queries so their layout also works inside the CMS preview, not only at a viewport breakpoint.

## Explicit responsive layout

Column counts stay fixed unless the grid opts into responsive behavior:

```html
<div class="grid--4 responsive spacing--base">...</div>
```

`grid--4` already includes `display: grid`. The optional `responsive` class changes three to five columns to two below `1024px`, then all grids to one column below `768px`. Without it, `grid--4` always means four columns.

A row only becomes a column when explicitly requested:

```html
<div class="flex--row responsive spacing--base">...</div>
```

`flex--row` and `flex--column` already include `display: flex`. Typography works the same way: use `heading--2` or `text--lg` without an extra base class.

Use `overflow-hidden` for clipping. The name `hidden` is intentionally not used because it normally implies `display: none`.

## Examples

```html
<section class="block background-[--color-surface]">
  <div class="container">
    <div class="block__body grid--3 spacing--base">
      <h2 class="heading--2">Section title</h2>
      <div class="grid--span-2">...</div>
    </div>
  </div>
</section>
```

```html
<button class="button button--primary button--md button--size-sm">
  Get started
</button>
```
