# Global layout templates

At 1024px and below every header uses a real button with the Lucide
TextAlignJustify icon. The unchanged header stays visible; its button switches
to Lucide X. A separate panel fills only the available space below the header,
with scroll locking, keyboard focus containment and Escape/toggle-button support.
`navigation.ts` provides the framework-independent event binding. The preview
adapter sizes the dialog to the simulated site viewport, not the admin window.
Desktop navigation starts above 1024px.

`layout.ts` contains seven header and seven footer variants. All use the same
`SiteLayout` interface; switching a variant never replaces content or navigation.
Rendering and utility classes live alongside the shared block library, not inside
the admin settings screen. `styles.css` contains only shared navigation helpers.

In the admin, **Layout** controls brand name, introduction, email, the optional
header action, copyright, optional phone/address/opening hours and two independent menus. Menus support two levels,
including real dropdowns and a mobile disclosure menu. The page picker includes
locally saved pages. Preview uses the same renderers as the variant thumbnails.

**Save layout** persists a versioned, validated local draft under
`harbstone:layout:v1`. Saved page previews and the page editor's live preview use
that draft. Layout's own preview includes unsaved changes and supports the same
device widths as the page preview. Nothing is published or sent to a server.
The three existing landing demos remain unchanged.

All header variants share `.cms-fixed-header` (position: fixed). The Next preview
adapter measures the real header height to reserve content space and aligns the
fixed header with the page or modal scroll viewport, including width changes.
Thumbnails explicitly use normal positioning. Public renderers must also reserve
the measured header height. Header variations use white surfaces and composition,
not decorative borders or contrasting navigation bands.

The current navigation adapter points to `/preview/[slug]` while public routing
is not connected. Replace that adapter when adding public site rendering; do not
put route-specific links into individual template variants.

Checks: run `npm run test:blocks` and `npm run build` in `admin`.
