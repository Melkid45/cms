# Harbstone 1.0 release checklist

Approved 21 November 2026. Current priorities:

1. Resolve Next.js security advisory; rebuild and rerun regression tests.
2. Browser-review 125 section variants with normal and long/missing content at desktop/tablet/mobile widths. Server-render tests alone do not establish visual readiness.
3. Exercise owner/client editor: create, text/image edit, reorder, preview, draft/autosave, publication, unsaved navigation and role restrictions.
4. Public homepage, URLs, 404 and menu correctness.
5. Enquiries and actual SMTP delivery/failure behavior.
6. Clean install, media/database setup, backup/restore on another installation.
7. Deployment and live verification.
8. Client pilot and final fixes.

Current pilot exercise: build three contrasting corporate sites through the admin UI only; 1–3 pages/site, at least five sections/page. Separate local installations preserve global brand/layout independence. Do not generate site documents via scripts or APIs.
