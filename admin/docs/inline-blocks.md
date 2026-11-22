# Forms and service details inside the page editor

- No separate Forms or Services management sections. Their old dashboard URLs redirect to Pages.
- Form sections have six shared-system variants: centered, photo, split introduction, dark, contact details and quick callback. The form schema belongs to the Section and follows draft/published snapshots and page history.
- Field settings are collapsed rows: label, placeholder, type, name, width, required state, options and ordering. Columns are selected for the block. Mobile collapses to a single column.
- Existing template contact forms can be customized in their section editor.
- Service repeater items hold an optional detail configuration. Content and images come from the card; only full description, opening mode and optional enquiry form are additional settings. Default is no detail opening. Modes: centered modal, drawer, detail page, editorial page.
- Button actions select a form block already on the website; unsaved form blocks on the current page are available immediately.
- Client accounts can edit allowed form text/images and service descriptions. Field structure, columns and opening mode remain owner-only.
- The renderer derives runtime form/service registries; these derived registries are not persisted as a second source of content. Old global definitions remain readable for compatibility, without creating additional navigation.
- Inline block API checks cover persistence, signed submissions, disabled/missing service rejection, draft isolation and published detail routes. The library includes 145 variants across 19 families.
