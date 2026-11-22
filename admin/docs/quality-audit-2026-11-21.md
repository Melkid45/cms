# Quality audit — 21 November 2026

## Implemented

- Dynamic sitemap: configured website origin, published/indexable pages, enabled catalog and published products. No speculative domain is emitted when none is configured.
- Robots: excludes dashboard, authentication, APIs and preview routes. Private pages also emit noindex metadata. Robots directives do not replace authentication.
- Public catalog/product metadata: canonical address and brand-specific titles, description and sharing image.
- Uploads: oriented WebP up to 2560px and separate 480px thumbnail; no enlargement, transparency retained. Invalid/overlarge or animated inputs are rejected with an actionable error. Animated files are rejected instead of silently losing animation.
- Media grid and chooser use thumbnails for new uploads. Existing assets retain their original URL; no destructive migration.
- Full backup includes local thumbnail files and restores their references.
- Shared wrapping for unbroken client text without hiding horizontal overflow.

## Automated verification

- `npm run test:blocks`: 125 variants, assets, escaping, unsafe links, published snapshots; additional render with long/unbroken text and absent images.
- `npm run test:images`: resize, thumbnails, no upscaling, transparent input and invalid input.
- `npm run test:roles`: isolated production server/data; owner/client restrictions, publication/autosave, concurrent updates, upload, account revocation, store/cart, full backup/restore and seven-day expiry, SEO.
- Added sitemap tests for drafts, noindex and publication changes, configured domain and admin noindex.
- Lint and production type/build checks.

## Not verified / remaining

- Browser access was unavailable in this chat. Actual layout overflow, pointer interactions, mobile animation and editor UX are NOT certified by server rendering.
- `scripts/check-block-overflow.mjs` exports a CUA browser audit. Run with a local authenticated tab at 1440, 1024, 768, 390 and 320px, both normal and stress content. Inspect intentional sliders separately and review screenshots; DOM geometry alone does not certify clipping/readability.
- `/library/{variant}?stress=1` is restricted to super admins and uses transient test content only.
- No deployment or production-data edits were performed.
- Installed Next.js 16.4.3 reports a security advisory during builds. Dependency remediation remains outstanding; successful compilation is not security sign-off.
- Existing uploaded images are not retroactively resized. New uploads receive optimized files/thumbnails.
