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
- Keep utilities single-purpose. A section-specific visual rule belongs next to that section.
- Use semantic names for repeated elements: `media-placeholder`, `divider`, `grid--span-2`.
- Keep component states (`hover`, `focus-visible`, `disabled`) with the component.
- Prefer `gap` for spacing between children and padding utilities for spacing inside a component.

## Examples

```html
<section class="block background-[--gray-100]">
  <div class="container">
    <div class="block__body grid grid--3 spacing--base">
      <h2 class="heading heading--2">Section title</h2>
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
