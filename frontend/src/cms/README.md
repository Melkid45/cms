# Editable Tailwind blocks

The existing HTML library remains unchanged. This first connected batch contains
two layouts each for About (8 legacy variants), Services (12), Column text (10),
Photo (10), and Text numbers (8).

- `schema.ts`: typed content contract, defaults, registry and URL allowlist.
- `render.ts`: the single renderer used by the Vite gallery and Next admin.
- `styles.css`: shared, scoped foundations; layout uses Tailwind utilities.
- `/block-library.html`: view the ten layouts in the frontend.
- Admin `/dashboard/pages/studio`: editable example with all five families.

Layouts within a family share fields, so switching layouts retains content.
Cards are repeatable and reorderable. Missing optional content is hidden.
No arbitrary HTML or styles are accepted. Rendering escapes text/attributes and
allows only safe URL protocols. Images are bundled assets or user-provided URLs.

The admin saves versioned drafts to browser localStorage. These are not server
data and are not published on Vercel. `/preview/[slug]` reads the saved draft in
the same origin/browser. Existing legacy blocks remain explicitly marked as not
connected; they are not silently replaced or lost. Public publishing, uploads,
database persistence, authentication and locale-specific records are future work.

Container queries size the blocks to the actual preview canvas rather than the
admin window. The shared renderer does not depend on React/Next, allowing later
server rendering or frontend consumption of the same structured content.
